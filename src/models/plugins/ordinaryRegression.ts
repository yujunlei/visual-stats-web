import { csvSummarySection, csvTableSection } from '../shared/csv'
import { compactConfig, paramArray } from '../shared/config'
import { createOlsPostEstimationTables } from '../shared/postEstimation'
import { fitOls, olsCoefficientColumns } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const anovaColumns = ['source', 'ss', 'df', 'ms']
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))

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
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'features', label: '核心自变量 X', kind: 'columns', role: 'feature', columnTypes: ['numeric', 'category'], required: true },
    { id: 'controls', label: '控制变量', kind: 'columns', role: 'feature', columnTypes: ['numeric', 'category'], helperText: '可选；运行时纳入回归，但与核心自变量分开展示。' },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const candidates = featureColumns.filter((column) => column !== target)
    const features = candidates.slice(0, 2)
    const controls = candidates.slice(2, 5)

    return {
      target,
      features,
      params: { target, features, controls },
    }
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const target = targetColumns.includes(config.target) ? config.target : targetColumns[0] ?? ''
    const fallbackFeatures = config.features.filter((feature) => featureColumns.includes(feature) && feature !== target)
    const features = unique(paramArray(config, 'features', fallbackFeatures).filter((feature) => featureColumns.includes(feature) && feature !== target))
    const controls = unique(paramArray(config, 'controls').filter((feature) => featureColumns.includes(feature) && feature !== target && !features.includes(feature)))

    return compactConfig(target, { target, features, controls }, features)
  },

  getFormula(config) {
    const controls = paramArray(config, 'controls')
    return `${config.target || 'y'} ~ ${config.features.join(' + ') || 'x'}${controls.length ? ` + controls(${controls.join(' + ')})` : ''}`
  },

  getSettings(config) {
    const controls = paramArray(config, 'controls')
    return [
      { label: '截距项', value: '启用' },
      { label: '估计方法', value: this.methodLabel },
      { label: '自变量数', value: String(config.features.length) },
      { label: '控制变量数', value: String(controls.length) },
    ]
  },

  fit({ rows, config, inference }) {
    const features = unique([...config.features, ...paramArray(config, 'controls')])
    const fitConfig = { ...config, features }
    const fit = fitOls(rows, config.target, features, this.name, inference)

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
        ...createOlsPostEstimationTables(rows, fitConfig, fit, [config.features, features], inference),
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
