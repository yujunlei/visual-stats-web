import { csvSummarySection, csvTableSection } from '../shared/csv'
import { createLogitPostEstimationTables } from '../shared/postEstimation'
import { fitLogit } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const coefficientColumns = ['term', 'coefficient', 'stdError', 'tValue', 'pValue', 'ciLow', 'ciHigh', 'oddsRatio']

export const logitRegressionPlugin: ModelPlugin = {
  id: 'logit-regression',
  name: 'LOGIT 回归',
  nodeLabel: 'LOGIT 回归',
  panelLabel: 'Logit Regression',
  resultLabel: 'Logit 系数',
  description: '二分类因变量的 Logistic 回归，输出系数、显著性和优势比。',
  methodLabel: 'MLE',
  shortName: 'LOGIT',
  fullName: 'Binary Logistic Regression',
  category: '离散选择模型',
  keywords: ['logit', 'logistic', 'binary', 'classification', '逻辑回归', '二分类'],
  requiresTarget: true,
  targetLabel: '二分类因变量 Y',
  featuresLabel: '解释变量 X',
  downloadName: 'logit-regression-report.csv',
  supportsCategoricalFeatures: true,

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    return {
      target: targetColumns[0] ?? '',
      features: featureColumns.filter((column) => column !== targetColumns[0]).slice(0, 5),
    }
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const target = targetColumns.includes(config.target) ? config.target : targetColumns[0] ?? ''
    return {
      target,
      features: config.features.filter((feature) => featureColumns.includes(feature) && feature !== target),
    }
  },

  getFormula(config) {
    return `logit ${config.target || 'y'} ${config.features.join(' ') || 'x'}`
  },

  getSettings(config) {
    return [
      { label: '估计方法', value: this.methodLabel },
      { label: '判别阈值', value: '0.5' },
      { label: '解释变量数', value: String(config.features.length) },
    ]
  },

  fit({ rows, config }) {
    const fit = fitLogit(rows, config.target, config.features, this.name)

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: fit.n },
        { label: 'Positive y', value: fit.positives },
        { label: 'Negative y', value: fit.negatives },
        { label: 'Log likelihood', value: fit.logLikelihood },
        { label: 'Pseudo R2', value: fit.pseudoR2 },
        { label: 'Accuracy', value: fit.accuracy },
      ],
      tables: [
        {
          id: 'coefficients',
          title: `Logit 系数估计 (${config.target})`,
          columns: coefficientColumns,
          rows: fit.coefficients,
        },
        ...createLogitPostEstimationTables(config, fit),
      ],
      diagnostics: [],
      message: 'LOGIT 使用浏览器内 IRLS 极大似然估计；因变量数值大于 0 视为 1，其余视为 0。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
