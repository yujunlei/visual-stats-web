import type { Row } from '../../data/types'
import { csvSummarySection, csvTableSection } from '../shared/csv'
import { compactConfig, paramArray, paramString } from '../shared/config'
import { fitOls, getCoefficient, normalPValue, olsCoefficientColumns } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const effectColumns = ['level', 'moderatorValue', 'effect', 'stdError', 'zValue', 'pValue']

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const stdDev = (values: number[]) => {
  if (values.length <= 1) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

export const moderationAnalysisPlugin: ModelPlugin = {
  id: 'moderation-analysis',
  name: '调节效应',
  nodeLabel: '调节效应',
  panelLabel: 'Moderation',
  resultLabel: '交互项检验',
  description: '估计 Y = X + W + X*W 的调节模型，显式选择处理变量 X 和调节变量 W。',
  methodLabel: 'Interaction OLS',
  shortName: 'MOD',
  fullName: 'Moderation Analysis',
  category: '机制检验',
  keywords: ['moderation', 'interaction', '调节', '交互项', 'moderator'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '已支持交互项和条件边际效应，Johnson-Neyman 区间仍在增强中。',
  },
  limitations: ['调节效应当前未提供 Johnson-Neyman 显著区间。'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: 'X、W、控制变量',
  downloadName: 'moderation-analysis-report.csv',
  supportsCategoricalFeatures: false,
  usesRawRows: true,
  supportsInference: true,
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'x', label: '处理变量 X', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'moderator', label: '调节变量 W', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'controls', label: '控制变量', kind: 'columns', role: 'feature', columnTypes: ['numeric'] },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const candidates = featureColumns.filter((column) => column !== target)
    const params = {
      target,
      x: candidates[0] ?? '',
      moderator: candidates[1] ?? '',
      controls: candidates.slice(2, 5),
    }

    return {
      ...compactConfig(target, params, [params.x, params.moderator, ...params.controls]),
    }
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const targetCandidate = paramString(config, 'target', config.target)
    const target = targetColumns.includes(targetCandidate) ? targetCandidate : targetColumns[0] ?? ''
    const fallbackFeatures = config.features.filter((feature) => featureColumns.includes(feature) && feature !== target)
    const xCandidate = paramString(config, 'x', fallbackFeatures[0])
    const moderatorCandidate = paramString(config, 'moderator', fallbackFeatures[1])
    const x = featureColumns.includes(xCandidate) && xCandidate !== target ? xCandidate : ''
    const moderator = featureColumns.includes(moderatorCandidate) && moderatorCandidate !== target && moderatorCandidate !== x ? moderatorCandidate : ''
    const controls = paramArray(config, 'controls', fallbackFeatures.slice(2))
      .filter((feature) => featureColumns.includes(feature) && ![target, x, moderator].includes(feature))
      .slice(0, 6)

    return compactConfig(target, { target, x, moderator, controls }, [x, moderator, ...controls])
  },

  getFormula(config) {
    const x = paramString(config, 'x', config.features[0] ?? 'x')
    const moderator = paramString(config, 'moderator', config.features[1] ?? 'w')
    const controls = paramArray(config, 'controls', config.features.slice(2))
    return `${config.target || 'y'} ~ ${x} + ${moderator} + ${x}*${moderator}${controls.length ? ` + ${controls.join(' + ')}` : ''}`
  },

  getSettings(config) {
    const x = paramString(config, 'x', config.features[0])
    const moderator = paramString(config, 'moderator', config.features[1])
    return [
      { label: '处理变量 X', value: x || '未选择' },
      { label: '调节变量 W', value: moderator || '未选择' },
      { label: '交互项', value: x && moderator ? `${x}×${moderator}` : '未生成' },
    ]
  },

  fit({ rows, config, inference }) {
    const x = paramString(config, 'x', config.features[0])
    const moderator = paramString(config, 'moderator', config.features[1])
    const controls = paramArray(config, 'controls', config.features.slice(2))
    if (!config.target || !x || !moderator) throw new Error('调节效应需要选择 Y、X 和调节变量 W。')

    const interaction = `${x}*${moderator}`
    const transformedRows = rows.map((row) => ({
      ...row,
      [interaction]: Number(row[x]) * Number(row[moderator]),
    })) as Row[]
    const fit = fitOls(transformedRows, config.target, [x, moderator, interaction, ...controls], this.name, inference)
    const xCoefficient = getCoefficient(fit, x)
    const interactionCoefficient = getCoefficient(fit, interaction)
    const moderatorValues = rows.map((row) => Number(row[moderator])).filter(Number.isFinite)
    const moderatorMean = mean(moderatorValues)
    const moderatorStd = stdDev(moderatorValues)
    const levels = [
      { level: 'Low W (-1 SD)', moderatorValue: moderatorMean - moderatorStd },
      { level: 'Mean W', moderatorValue: moderatorMean },
      { level: 'High W (+1 SD)', moderatorValue: moderatorMean + moderatorStd },
    ]
    const effectRows = levels.map((entry) => {
      const effect = xCoefficient.coefficient + interactionCoefficient.coefficient * entry.moderatorValue
      const xIndex = xCoefficient.index
      const interactionIndex = interactionCoefficient.index
      const variance =
        fit.covariance[xIndex][xIndex] +
        entry.moderatorValue ** 2 * fit.covariance[interactionIndex][interactionIndex] +
        2 * entry.moderatorValue * fit.covariance[xIndex][interactionIndex]
      const stdError = Math.sqrt(Math.max(variance, 0))
      const zValue = stdError === 0 ? 0 : effect / stdError

      return { ...entry, effect, stdError, zValue, pValue: normalPValue(zValue) }
    })

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: fit.n },
        { label: 'Interaction coef', value: interactionCoefficient.coefficient },
        { label: 'Interaction p', value: normalPValue(interactionCoefficient.coefficient / interactionCoefficient.stdError), precision: 3 },
        { label: 'R-squared', value: fit.r2 },
        { label: 'Adj R-squared', value: fit.adjustedR2 },
        { label: 'Root MSE', value: fit.rootMse },
      ],
      tables: [
        {
          id: 'effects',
          title: '条件边际效应',
          columns: effectColumns,
          rows: effectRows,
        },
        {
          id: 'coefficients',
          title: '调节模型系数',
          columns: olsCoefficientColumns,
          rows: fit.coefficients,
        },
      ],
      diagnostics: [],
      warnings: fit.warnings,
      message: '调节效应通过交互项 X*W 估计，并给出 W 低/中/高水平下 X 的条件边际效应。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
