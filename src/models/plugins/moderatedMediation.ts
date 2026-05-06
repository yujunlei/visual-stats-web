import type { Row } from '../../data/types'
import { csvSummarySection, csvTableSection } from '../shared/csv'
import { bootstrapSamples, hashSeed, summarizeBootstrap } from '../shared/bootstrap'
import { compactConfig, paramArray, paramString } from '../shared/config'
import { fitOls, getCoefficient, olsCoefficientColumns } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const conditionalColumns = ['level', 'moderatorValue', 'aPath', 'bPath', 'indirectEffect', 'bootCiLow', 'bootCiHigh', 'bootstrapReps', 'directEffect']

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const stdDev = (values: number[]) => {
  if (values.length <= 1) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

export const moderatedMediationPlugin: ModelPlugin = {
  id: 'moderated-mediation',
  name: '有调节中介',
  nodeLabel: '有调节中介',
  panelLabel: 'Moderated Mediation',
  resultLabel: '条件间接效应',
  description: '估计 X -> M -> Y 且 W 调节路径的模型，显式选择 X、M、W 和控制变量。',
  methodLabel: 'Conditional Process',
  shortName: 'MMED',
  fullName: 'Moderated Mediation',
  category: '机制检验',
  keywords: ['moderated mediation', 'conditional process', '调节中介', '有调节中介', 'process'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '已支持条件间接效应估计和轻量 Bootstrap 置信区间。',
  },
  limitations: ['PROCESS 模板编号和指数检验仍在增强；Bootstrap 当前在浏览器内轻量执行。'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: 'X、M、W、控制变量',
  downloadName: 'moderated-mediation-report.csv',
  supportsCategoricalFeatures: false,
  usesRawRows: true,
  supportsInference: true,
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'x', label: '处理变量 X', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'mediator', label: '中介变量 M', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'moderator', label: '调节变量 W', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'controls', label: '控制变量', kind: 'columns', role: 'feature', columnTypes: ['numeric'] },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const candidates = featureColumns.filter((column) => column !== target)
    const params = {
      target,
      x: candidates[0] ?? '',
      mediator: candidates[1] ?? '',
      moderator: candidates[2] ?? '',
      controls: candidates.slice(3, 6),
    }

    return {
      ...compactConfig(target, params, [params.x, params.mediator, params.moderator, ...params.controls]),
    }
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const targetCandidate = paramString(config, 'target', config.target)
    const target = targetColumns.includes(targetCandidate) ? targetCandidate : targetColumns[0] ?? ''
    const fallbackFeatures = config.features.filter((feature) => featureColumns.includes(feature) && feature !== target)
    const x = paramString(config, 'x', fallbackFeatures[0])
    const mediator = paramString(config, 'mediator', fallbackFeatures[1])
    const moderator = paramString(config, 'moderator', fallbackFeatures[2])
    const selected = [target, x, mediator, moderator]
    const controls = paramArray(config, 'controls', fallbackFeatures.slice(3))
      .filter((feature) => featureColumns.includes(feature) && !selected.includes(feature))
      .slice(0, 6)
    const validX = featureColumns.includes(x) && x !== target ? x : ''
    const validMediator = featureColumns.includes(mediator) && ![target, validX].includes(mediator) ? mediator : ''
    const validModerator = featureColumns.includes(moderator) && ![target, validX, validMediator].includes(moderator) ? moderator : ''

    return compactConfig(target, { target, x: validX, mediator: validMediator, moderator: validModerator, controls }, [validX, validMediator, validModerator, ...controls])
  },

  getFormula(config) {
    const x = paramString(config, 'x', config.features[0] ?? 'x')
    const mediator = paramString(config, 'mediator', config.features[1] ?? 'm')
    const moderator = paramString(config, 'moderator', config.features[2] ?? 'w')
    const controls = paramArray(config, 'controls', config.features.slice(3))
    return `process ${config.target || 'y'}: ${x} -> ${mediator} -> Y moderated by ${moderator}${controls.length ? ` | ${controls.join(' + ')}` : ''}`
  },

  getSettings(config) {
    return [
      { label: '处理变量 X', value: paramString(config, 'x', config.features[0]) || '未选择' },
      { label: '中介变量 M', value: paramString(config, 'mediator', config.features[1]) || '未选择' },
      { label: '调节变量 W', value: paramString(config, 'moderator', config.features[2]) || '未选择' },
    ]
  },

  fit({ rows, config, inference }) {
    const x = paramString(config, 'x', config.features[0])
    const mediator = paramString(config, 'mediator', config.features[1])
    const moderator = paramString(config, 'moderator', config.features[2])
    const controls = paramArray(config, 'controls', config.features.slice(3))
    if (!config.target || !x || !mediator || !moderator) {
      throw new Error('有调节中介需要选择 Y、X、中介变量 M 和调节变量 W。')
    }

    const xw = `${x}*${moderator}`
    const mw = `${mediator}*${moderator}`
    const transformedRows = rows.map((row) => ({
      ...row,
      [xw]: Number(row[x]) * Number(row[moderator]),
      [mw]: Number(row[mediator]) * Number(row[moderator]),
    })) as Row[]
    const mediatorFit = fitOls(transformedRows, mediator, [x, moderator, xw, ...controls], '中介方程', inference)
    const outcomeFit = fitOls(transformedRows, config.target, [x, mediator, moderator, xw, mw, ...controls], '结果方程', inference)
    const wValues = rows.map((row) => Number(row[moderator])).filter(Number.isFinite)
    const wMean = mean(wValues)
    const wStd = stdDev(wValues)
    const moderatorLevels = [
      { level: 'Low W (-1 SD)', moderatorValue: wMean - wStd },
      { level: 'Mean W', moderatorValue: wMean },
      { level: 'High W (+1 SD)', moderatorValue: wMean + wStd },
    ]
    const estimateConditionalEffects = (sampleRows: Row[]) => {
      const sampleRowsWithTerms = sampleRows.map((row) => ({
        ...row,
        [xw]: Number(row[x]) * Number(row[moderator]),
        [mw]: Number(row[mediator]) * Number(row[moderator]),
      })) as Row[]
      const sampleMediatorFit = fitOls(sampleRowsWithTerms, mediator, [x, moderator, xw, ...controls], '中介方程')
      const sampleOutcomeFit = fitOls(sampleRowsWithTerms, config.target, [x, mediator, moderator, xw, mw, ...controls], '结果方程')
      const sampleA1 = getCoefficient(sampleMediatorFit, x).coefficient
      const sampleA3 = getCoefficient(sampleMediatorFit, xw).coefficient
      const sampleB1 = getCoefficient(sampleOutcomeFit, mediator).coefficient
      const sampleB3 = getCoefficient(sampleOutcomeFit, mw).coefficient

      return moderatorLevels.map((entry) => (sampleA1 + sampleA3 * entry.moderatorValue) * (sampleB1 + sampleB3 * entry.moderatorValue))
    }
    const a1 = getCoefficient(mediatorFit, x).coefficient
    const a3 = getCoefficient(mediatorFit, xw).coefficient
    const b1 = getCoefficient(outcomeFit, mediator).coefficient
    const b3 = getCoefficient(outcomeFit, mw).coefficient
    const c1 = getCoefficient(outcomeFit, x).coefficient
    const c3 = getCoefficient(outcomeFit, xw).coefficient
    const bootstrapIterations = rows.length > 5000 ? 100 : 200
    const seed = hashSeed(`${this.id}:${config.target}:${x}:${mediator}:${moderator}:${controls.join('|')}`)
    const bootstrapEstimates = bootstrapSamples(rows, bootstrapIterations, seed, estimateConditionalEffects)
    const conditionalRows = moderatorLevels.map((entry, levelIndex) => {
      const aPath = a1 + a3 * entry.moderatorValue
      const bPath = b1 + b3 * entry.moderatorValue
      const directEffect = c1 + c3 * entry.moderatorValue
      const indirectEffect = aPath * bPath
      const bootstrapDraws = bootstrapEstimates.map((estimate) => estimate[levelIndex]).filter(Number.isFinite)

      return {
        ...entry,
        aPath,
        bPath,
        indirectEffect,
        ...summarizeBootstrap(indirectEffect, bootstrapDraws),
        directEffect,
      }
    })

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: outcomeFit.n },
        { label: 'Index of MM', value: a3 * b1 + a1 * b3 },
        { label: 'Mean indirect', value: conditionalRows[1].indirectEffect },
        { label: 'High indirect', value: conditionalRows[2].indirectEffect },
        { label: 'Outcome R2', value: outcomeFit.r2 },
        { label: 'Mediator R2', value: mediatorFit.r2 },
        { label: 'Bootstrap reps', value: Math.min(...conditionalRows.map((row) => row.bootstrapReps)) },
      ],
      tables: [
        {
          id: 'conditional-effects',
          title: '条件间接效应',
          columns: conditionalColumns,
          rows: conditionalRows,
        },
        {
          id: 'outcome',
          title: '结果方程系数',
          columns: olsCoefficientColumns,
          rows: outcomeFit.coefficients,
        },
        {
          id: 'mediator',
          title: '中介方程系数',
          columns: olsCoefficientColumns,
          rows: mediatorFit.coefficients,
        },
      ],
      diagnostics: [],
      warnings: [...mediatorFit.warnings, ...outcomeFit.warnings],
      message: '有调节中介输出 W 低/中/高水平下的条件间接效应，并给出浏览器内 Bootstrap 95% 置信区间。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
