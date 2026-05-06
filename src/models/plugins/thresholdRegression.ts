import type { Row } from '../../data/types'
import { csvSummarySection, csvTableSection } from '../shared/csv'
import { compactConfig, paramArray, paramString } from '../shared/config'
import { fitOls, olsCoefficientColumns } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const thresholdColumns = ['threshold', 'sse', 'rSquared', 'lowCoefficient', 'highCoefficient', 'leftObs', 'rightObs']

const quantile = (values: number[], probability: number) => {
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * probability
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

export const thresholdRegressionPlugin: ModelPlugin = {
  id: 'threshold-regression',
  name: '门槛回归',
  nodeLabel: '门槛回归',
  panelLabel: 'Threshold Regression',
  resultLabel: '阈值搜索',
  description: '自动搜索单一门槛值，显式选择门槛变量 Q、核心解释变量 X 和控制变量。',
  methodLabel: 'Grid Search OLS',
  shortName: 'THR',
  fullName: 'Single Threshold Regression',
  category: '非线性模型',
  keywords: ['threshold', '门槛', '阈值', 'hansen', 'nonlinear'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '已支持单阈值网格搜索，Bootstrap LR 检验仍在增强中。',
  },
  limitations: ['门槛回归当前未提供 Bootstrap 门槛显著性检验。'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: 'Q、X、控制变量',
  downloadName: 'threshold-regression-report.csv',
  supportsCategoricalFeatures: false,
  usesRawRows: true,
  supportsInference: true,
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'threshold', label: '门槛变量 Q', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'x', label: '核心解释变量 X', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'controls', label: '控制变量', kind: 'columns', role: 'feature', columnTypes: ['numeric'] },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const candidates = featureColumns.filter((column) => column !== target)
    const params = {
      target,
      threshold: candidates[0] ?? '',
      x: candidates[1] ?? candidates[0] ?? '',
      controls: candidates.slice(2, 5),
    }

    return {
      ...compactConfig(target, params, [params.threshold, params.x, ...params.controls]),
    }
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const targetCandidate = paramString(config, 'target', config.target)
    const target = targetColumns.includes(targetCandidate) ? targetCandidate : targetColumns[0] ?? ''
    const fallbackFeatures = config.features.filter((feature) => featureColumns.includes(feature) && feature !== target)
    const threshold = paramString(config, 'threshold', fallbackFeatures[0])
    const x = paramString(config, 'x', fallbackFeatures[1] ?? fallbackFeatures[0])
    const controls = paramArray(config, 'controls', fallbackFeatures.slice(2))
      .filter((feature) => featureColumns.includes(feature) && ![target, threshold, x].includes(feature))
      .slice(0, 6)
    const validThreshold = featureColumns.includes(threshold) && threshold !== target ? threshold : ''
    const validX = featureColumns.includes(x) && x !== target ? x : ''

    return compactConfig(target, { target, threshold: validThreshold, x: validX, controls }, [validThreshold, validX, ...controls])
  },

  getFormula(config) {
    const threshold = paramString(config, 'threshold', config.features[0] ?? 'q')
    const x = paramString(config, 'x', config.features[1] ?? threshold)
    const controls = paramArray(config, 'controls', config.features.slice(2))
    return `${config.target || 'y'} ~ ${x} I(${threshold}<=γ) + ${x} I(${threshold}>γ)${controls.length ? ` + ${controls.join(' + ')}` : ''}`
  },

  getSettings(config) {
    return [
      { label: '门槛变量 Q', value: paramString(config, 'threshold', config.features[0]) || '未选择' },
      { label: '核心解释变量 X', value: paramString(config, 'x', config.features[1] ?? config.features[0]) || '未选择' },
      { label: '搜索范围', value: '15%-85% 分位' },
    ]
  },

  fit({ rows, config, inference }) {
    const thresholdVariable = paramString(config, 'threshold', config.features[0])
    const x = paramString(config, 'x', config.features[1] ?? thresholdVariable)
    const controls = paramArray(config, 'controls', config.features.slice(2))
    if (!config.target || !thresholdVariable || !x) throw new Error('门槛回归需要选择 Y、门槛变量 Q 和核心解释变量 X。')

    const thresholdValues = rows.map((row) => Number(row[thresholdVariable])).filter(Number.isFinite)
    const lower = quantile(thresholdValues, 0.15)
    const upper = quantile(thresholdValues, 0.85)
    const candidates = Array.from(new Set(thresholdValues.filter((value) => value > lower && value < upper))).slice(0, 80)

    if (candidates.length < 3) throw new Error('门槛变量可用取值太少，无法搜索门槛。')

    const candidatesFits = candidates.map((threshold) => {
      const lowTerm = `${x}_low`
      const highTerm = `${x}_high`
      const transformedRows = rows.map((row) => {
        const qValue = Number(row[thresholdVariable])
        const xValue = Number(row[x])

        return {
          ...row,
          [lowTerm]: Number.isFinite(qValue) && Number.isFinite(xValue) && qValue <= threshold ? xValue : 0,
          [highTerm]: Number.isFinite(qValue) && Number.isFinite(xValue) && qValue > threshold ? xValue : 0,
        }
      }) as Row[]
      const fit = fitOls(transformedRows, config.target, [lowTerm, highTerm, ...controls], this.name, inference)
      const lowCoefficient = fit.coefficients.find((entry) => entry.term === lowTerm)?.coefficient ?? 0
      const highCoefficient = fit.coefficients.find((entry) => entry.term === highTerm)?.coefficient ?? 0

      return {
        threshold,
        fit,
        lowTerm,
        highTerm,
        lowCoefficient,
        highCoefficient,
        leftObs: thresholdValues.filter((value) => value <= threshold).length,
        rightObs: thresholdValues.filter((value) => value > threshold).length,
      }
    })
    const best = candidatesFits.sort((left, right) => left.fit.sse - right.fit.sse)[0]

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: best.fit.n },
        { label: 'Best threshold', value: best.threshold },
        { label: 'Low slope', value: best.lowCoefficient },
        { label: 'High slope', value: best.highCoefficient },
        { label: 'R-squared', value: best.fit.r2 },
        { label: 'Root MSE', value: best.fit.rootMse },
      ],
      tables: [
        {
          id: 'thresholds',
          title: '候选门槛搜索',
          columns: thresholdColumns,
          rows: candidatesFits.slice(0, 12).map((entry) => ({
            threshold: entry.threshold,
            sse: entry.fit.sse,
            rSquared: entry.fit.r2,
            lowCoefficient: entry.lowCoefficient,
            highCoefficient: entry.highCoefficient,
            leftObs: entry.leftObs,
            rightObs: entry.rightObs,
          })),
        },
        {
          id: 'coefficients',
          title: '最优门槛模型系数',
          columns: olsCoefficientColumns,
          rows: best.fit.coefficients,
        },
      ],
      diagnostics: [],
      warnings: best.fit.warnings,
      message: '门槛回归当前支持单一阈值网格搜索；显著性检验后续可扩展 Bootstrap LR 检验。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
