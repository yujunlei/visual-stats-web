import { csvSummarySection, csvTableSection } from '../shared/csv'
import { createOlsPostEstimationTables } from '../shared/postEstimation'
import { fitOls, olsCoefficientColumns } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const anovaColumns = ['source', 'ss', 'df', 'ms']

export const ordinaryRegressionPlugin: ModelPlugin = {
  id: 'ordinary-regression',
  name: '普通回归',
  nodeLabel: '普通回归',
  panelLabel: 'Ordinary Regression',
  resultLabel: '系数表',
  description: '标准多元普通最小二乘回归，用于快速估计 Y 与多个 X 的线性关系。',
  methodLabel: 'OLS',
  shortName: 'REG',
  fullName: 'Multiple Linear Regression',
  category: '回归模型',
  keywords: ['reg', 'ols', 'multiple regression', '普通回归', '多元回归', '回归'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: '自变量 X',
  downloadName: 'ordinary-regression-report.csv',
  supportsCategoricalFeatures: true,
  supportsInference: true,

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
    return `${config.target || 'y'} ~ ${config.features.join(' + ') || 'x'}`
  },

  getSettings(config) {
    return [
      { label: '截距项', value: '启用' },
      { label: '估计方法', value: this.methodLabel },
      { label: '自变量数', value: String(config.features.length) },
    ]
  },

  fit({ rows, config, inference }) {
    const fit = fitOls(rows, config.target, config.features, this.name, inference)

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: fit.n },
        { label: `F(${fit.dfModel}, ${fit.dfResidual})`, value: fit.fValue },
        { label: 'Prob > F', value: fit.fPValue },
        { label: 'R-squared', value: fit.r2 },
        { label: 'Adj R-squared', value: fit.adjustedR2 },
        { label: 'Root MSE', value: fit.rootMse },
        { label: 'Std. error', value: fit.standardError === 'cluster' ? `Cluster ${fit.clusterField}` : fit.standardError },
      ],
      tables: [
        {
          id: 'anova',
          title: '方差分解',
          columns: anovaColumns,
          rows: [
            { source: 'Model', ss: fit.ssModel, df: fit.dfModel, ms: fit.msModel },
            { source: 'Residual', ss: fit.sse, df: fit.dfResidual, ms: fit.mse },
            { source: 'Total', ss: fit.sst, df: fit.dfTotal, ms: fit.msTotal },
          ],
        },
        {
          id: 'coefficients',
          title: `系数估计 (${config.target})`,
          columns: olsCoefficientColumns,
          rows: fit.coefficients,
        },
        ...createOlsPostEstimationTables(rows, config, fit, undefined, inference),
      ],
      diagnostics: [
        {
          id: 'actual-vs-fitted',
          title: '拟合诊断',
          kind: 'actual-vs-fitted',
          actual: fit.actual,
          fitted: fit.fitted,
        },
      ],
      warnings: fit.warnings,
      message: '普通回归已完成；分类变量可通过 one-hot 编码进入模型。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
