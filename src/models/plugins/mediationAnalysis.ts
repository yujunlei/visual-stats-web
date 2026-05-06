import { csvSummarySection, csvTableSection } from '../shared/csv'
import { bootstrapSamples, hashSeed, summarizeBootstrap } from '../shared/bootstrap'
import { compactConfig, paramArray, paramString } from '../shared/config'
import { fitOls, getCoefficient, normalPValue, olsCoefficientColumns } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const pathColumns = ['path', 'coefficient', 'stdError', 'zValue', 'pValue']
const bootstrapColumns = ['effect', 'estimate', 'bootCiLow', 'bootCiHigh', 'bootstrapReps']

export const mediationAnalysisPlugin: ModelPlugin = {
  id: 'mediation-analysis',
  name: '中介效应',
  nodeLabel: '中介效应',
  panelLabel: 'Mediation',
  resultLabel: '路径效应',
  description: '按 X -> M -> Y 的路径估计中介效应，显式选择处理变量、中介变量和控制变量。',
  methodLabel: 'Sobel',
  shortName: 'MED',
  fullName: 'Mediation Analysis',
  category: '机制检验',
  keywords: ['mediation', 'mediator', 'sobel', '中介', '中介效应', '机制'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '已支持 Sobel 近似中介检验和轻量 Bootstrap 置信区间。',
  },
  limitations: ['Bootstrap 当前在浏览器内执行，默认抽样次数较轻；大样本正式论文建议接入后端统计引擎复核。'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: 'X、M、控制变量',
  downloadName: 'mediation-analysis-report.csv',
  supportsCategoricalFeatures: false,
  usesRawRows: true,
  supportsInference: true,
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'x', label: '处理变量 X', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'mediator', label: '中介变量 M', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'controls', label: '控制变量', kind: 'columns', role: 'feature', columnTypes: ['numeric'], helperText: '可选；不会再依赖字段选择顺序。' },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const candidates = featureColumns.filter((column) => column !== target)
    const params = {
      target,
      x: candidates[0] ?? '',
      mediator: candidates[1] ?? '',
      controls: candidates.slice(2, 5),
    }

    return {
      ...compactConfig(target, params, [params.x, params.mediator, ...params.controls]),
    }
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const targetCandidate = paramString(config, 'target', config.target)
    const target = targetColumns.includes(targetCandidate) ? targetCandidate : targetColumns[0] ?? ''
    const fallbackFeatures = config.features.filter((feature) => featureColumns.includes(feature) && feature !== target)
    const xCandidate = paramString(config, 'x', fallbackFeatures[0])
    const mediatorCandidate = paramString(config, 'mediator', fallbackFeatures[1])
    const x = featureColumns.includes(xCandidate) && xCandidate !== target ? xCandidate : ''
    const mediator = featureColumns.includes(mediatorCandidate) && mediatorCandidate !== target && mediatorCandidate !== x ? mediatorCandidate : ''
    const controls = paramArray(config, 'controls', fallbackFeatures.slice(2))
      .filter((feature) => featureColumns.includes(feature) && ![target, x, mediator].includes(feature))
      .slice(0, 6)

    return compactConfig(target, { target, x, mediator, controls }, [x, mediator, ...controls])
  },

  getFormula(config) {
    const x = paramString(config, 'x', config.features[0] ?? 'x')
    const mediator = paramString(config, 'mediator', config.features[1] ?? 'm')
    const controls = paramArray(config, 'controls', config.features.slice(2))
    return `mediate ${config.target || 'y'} ${x} -> ${mediator}${controls.length ? ` | ${controls.join(' + ')}` : ''}`
  },

  getSettings(config) {
    const controls = paramArray(config, 'controls', config.features.slice(2))
    return [
      { label: '处理变量 X', value: paramString(config, 'x', config.features[0]) || '未选择' },
      { label: '中介变量 M', value: paramString(config, 'mediator', config.features[1]) || '未选择' },
      { label: '控制变量数', value: String(controls.length) },
    ]
  },

  fit({ rows, config, inference }) {
    const x = paramString(config, 'x', config.features[0])
    const mediator = paramString(config, 'mediator', config.features[1])
    const controls = paramArray(config, 'controls', config.features.slice(2))
    if (!config.target || !x || !mediator) throw new Error('中介效应需要选择 Y、X 和中介变量 M。')

    const estimateEffects = (sampleRows: typeof rows) => {
      const sampleMediatorFit = fitOls(sampleRows, mediator, [x, ...controls], '中介方程')
      const sampleOutcomeFit = fitOls(sampleRows, config.target, [x, mediator, ...controls], '结果方程')
      const sampleTotalFit = fitOls(sampleRows, config.target, [x, ...controls], '总效应方程')
      const sampleA = getCoefficient(sampleMediatorFit, x)
      const sampleB = getCoefficient(sampleOutcomeFit, mediator)
      const sampleDirect = getCoefficient(sampleOutcomeFit, x)
      const sampleTotal = getCoefficient(sampleTotalFit, x)

      return {
        indirect: sampleA.coefficient * sampleB.coefficient,
        direct: sampleDirect.coefficient,
        total: sampleTotal.coefficient,
      }
    }
    const mediatorFit = fitOls(rows, mediator, [x, ...controls], '中介方程', inference)
    const outcomeFit = fitOls(rows, config.target, [x, mediator, ...controls], '结果方程', inference)
    const totalFit = fitOls(rows, config.target, [x, ...controls], '总效应方程', inference)
    const a = getCoefficient(mediatorFit, x)
    const b = getCoefficient(outcomeFit, mediator)
    const direct = getCoefficient(outcomeFit, x)
    const total = getCoefficient(totalFit, x)
    const indirect = a.coefficient * b.coefficient
    const indirectStdError = Math.sqrt(b.coefficient ** 2 * a.stdError ** 2 + a.coefficient ** 2 * b.stdError ** 2)
    const zValue = indirectStdError === 0 ? 0 : indirect / indirectStdError
    const pValue = normalPValue(zValue)
    const proportion = total.coefficient === 0 ? 0 : indirect / total.coefficient
    const bootstrapIterations = rows.length > 5000 ? 100 : 200
    const seed = hashSeed(`${this.id}:${config.target}:${x}:${mediator}:${controls.join('|')}`)
    const bootstrapEstimates = bootstrapSamples(rows, bootstrapIterations, seed, estimateEffects)
    const indirectDraws = bootstrapEstimates.map((estimate) => estimate.indirect).filter(Number.isFinite)
    const directDraws = bootstrapEstimates.map((estimate) => estimate.direct).filter(Number.isFinite)
    const totalDraws = bootstrapEstimates.map((estimate) => estimate.total).filter(Number.isFinite)
    const bootstrapSummaries = [
      { effect: 'Indirect: a*b', ...summarizeBootstrap(indirect, indirectDraws) },
      { effect: 'Direct effect', ...summarizeBootstrap(direct.coefficient, directDraws) },
      { effect: 'Total effect', ...summarizeBootstrap(total.coefficient, totalDraws) },
    ]

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: outcomeFit.n },
        { label: 'Indirect effect', value: indirect },
        { label: 'Direct effect', value: direct.coefficient },
        { label: 'Total effect', value: total.coefficient },
        { label: 'Sobel p', value: pValue },
        { label: 'Mediated share', value: proportion },
        { label: 'Bootstrap reps', value: Math.min(indirectDraws.length, directDraws.length, totalDraws.length) },
      ],
      tables: [
        {
          id: 'paths',
          title: '路径效应',
          columns: pathColumns,
          rows: [
            { path: `a: ${x} -> ${mediator}`, coefficient: a.coefficient, stdError: a.stdError, zValue: a.coefficient / a.stdError, pValue: normalPValue(a.coefficient / a.stdError) },
            { path: `b: ${mediator} -> ${config.target}`, coefficient: b.coefficient, stdError: b.stdError, zValue: b.coefficient / b.stdError, pValue: normalPValue(b.coefficient / b.stdError) },
            { path: 'Indirect: a*b', coefficient: indirect, stdError: indirectStdError, zValue, pValue },
            { path: `Direct: ${x} -> ${config.target}`, coefficient: direct.coefficient, stdError: direct.stdError, zValue: direct.coefficient / direct.stdError, pValue: normalPValue(direct.coefficient / direct.stdError) },
            { path: 'Total effect', coefficient: total.coefficient, stdError: total.stdError, zValue: total.coefficient / total.stdError, pValue: normalPValue(total.coefficient / total.stdError) },
          ],
        },
        {
          id: 'bootstrap',
          title: 'Bootstrap 置信区间',
          columns: bootstrapColumns,
          rows: bootstrapSummaries,
        },
        {
          id: 'outcome',
          title: '结果方程系数',
          columns: olsCoefficientColumns,
          rows: outcomeFit.coefficients,
        },
      ],
      diagnostics: [],
      warnings: [...mediatorFit.warnings, ...outcomeFit.warnings, ...totalFit.warnings],
      message: '中介效应采用三方程 OLS、Sobel 近似检验，并给出浏览器内 Bootstrap 95% 置信区间。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
