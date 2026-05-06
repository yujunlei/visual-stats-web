import { csvSummarySection, csvTableSection } from '../shared/csv'
import { compactConfig, paramArray, paramString } from '../shared/config'
import { absorbFixedEffects } from '../shared/fixedEffects'
import { createResidualDiagnosticsTable, createRobustnessTable } from '../shared/postEstimation'
import { fitOlsDroppingCollinear, olsCoefficientColumns } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const effectColumns = ['effect', 'groups', 'singletonGroups', 'minObs', 'maxObs', 'avgObs', 'absorbedDf']
const droppedColumns = ['variable', 'reason']

export const reghdfeRegressionPlugin: ModelPlugin = {
  id: 'reghdfe-regression',
  name: '高维固定效应',
  nodeLabel: '高维固定效应',
  panelLabel: 'reghdfe',
  resultLabel: 'HDFE 系数',
  description: 'Stata reghdfe 风格的多重固定效应吸收。显式选择 absorb 固定效应和解释变量。',
  methodLabel: 'Absorbed FE OLS',
  shortName: 'REGHDFE',
  fullName: 'High-Dimensional Fixed Effects Regression',
  category: '面板模型',
  keywords: ['reghdfe', 'hdfe', 'absorb', 'fixed effects', '高维固定效应', '吸收固定效应'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '已支持多重固定效应吸收、聚类稳健标准误和固定效应摘要。',
  },
  limitations: ['reghdfe 当前尚未实现多向聚类和 Stata reghdfe 的完整自由度修正。'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: '吸收 FE、解释变量 X',
  downloadName: 'reghdfe-report.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: ['numeric', 'category'],
  includeDimensionFields: true,
  usesRawRows: true,
  supportsInference: true,
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'fixedEffects', label: '吸收固定效应 absorb', kind: 'columns', role: 'feature', columnTypes: ['numeric', 'category'], required: true, maxSelections: 3 },
    { id: 'regressors', label: '解释变量 X', kind: 'columns', role: 'feature', columnTypes: ['numeric'], required: true },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const effects = featureColumns.filter((column) => column !== target).slice(0, 2)
    const regressors = featureColumns.filter((column) => column !== target && !effects.includes(column)).slice(0, 4)
    const params = { target, fixedEffects: effects, regressors }

    return compactConfig(target, params, [...effects, ...regressors])
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const targetCandidate = paramString(config, 'target', config.target)
    const target = targetColumns.includes(targetCandidate) ? targetCandidate : targetColumns[0] ?? ''
    const fallbackFeatures = config.features.filter((feature) => featureColumns.includes(feature) && feature !== target)
    const fixedEffects = paramArray(config, 'fixedEffects', fallbackFeatures.slice(0, 2))
      .filter((feature) => featureColumns.includes(feature) && feature !== target)
      .slice(0, 3)
    const regressors = paramArray(config, 'regressors', fallbackFeatures.slice(fixedEffects.length || 2))
      .filter((feature) => featureColumns.includes(feature) && ![target, ...fixedEffects].includes(feature))
      .slice(0, 7)

    return compactConfig(target, { target, fixedEffects, regressors }, [...fixedEffects, ...regressors])
  },

  getFormula(config) {
    const effects = paramArray(config, 'fixedEffects', config.features.slice(0, 2))
    const regressors = paramArray(config, 'regressors', config.features.slice(effects.length || 2))
    return `reghdfe ${config.target || 'y'} ${regressors.join(' ') || 'x'}, absorb(${effects.join(' ') || 'fe'})`
  },

  getSettings(config) {
    const effects = paramArray(config, 'fixedEffects', config.features.slice(0, 2))
    const regressors = paramArray(config, 'regressors', config.features.slice(effects.length || 2))
    return [
      { label: '吸收固定效应', value: effects.join(', ') || '未选择' },
      { label: '估计方法', value: this.methodLabel },
      { label: '解释变量数', value: String(regressors.length) },
    ]
  },

  fit({ rows, config, inference }) {
    const fixedEffects = paramArray(config, 'fixedEffects', config.features.slice(0, 2))
    const regressors = paramArray(config, 'regressors', config.features.slice(fixedEffects.length || 2))
    if (!config.target || fixedEffects.length === 0 || regressors.length === 0) {
      throw new Error('reghdfe 需要选择 Y、至少一个吸收固定效应字段，以及至少一个解释变量。')
    }

    const absorbed = absorbFixedEffects({
      rows,
      target: config.target,
      regressors,
      fixedEffects,
      prefix: 'hdfe',
      preserveColumns: inference?.standardError === 'cluster' && inference.clusterField ? [inference.clusterField] : [],
    })
    const { fit, droppedFeatures } = fitOlsDroppingCollinear(absorbed.rows, absorbed.target, absorbed.features, this.name, inference)
    const residualDiagnosticsTable = createResidualDiagnosticsTable(absorbed.rows, absorbed.target, absorbed.features, fit)
    const robustnessTable = createRobustnessTable(absorbed.rows, { target: absorbed.target, features: absorbed.features }, undefined, inference)

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: absorbed.observations },
        { label: 'Absorbed FE', value: fixedEffects.length },
        { label: 'Absorbed df', value: absorbed.absorbedDf },
        { label: 'Singleton groups', value: absorbed.groups.reduce((sum, entry) => sum + entry.singletonGroups, 0) },
        { label: 'F statistic', value: fit.fValue },
        { label: 'Within R2', value: fit.r2 },
        { label: 'Root MSE', value: fit.rootMse },
        { label: 'Std. error', value: fit.standardError === 'cluster' ? `Cluster ${fit.clusterField}` : fit.standardError },
      ],
      tables: [
        {
          id: 'effects',
          title: '吸收固定效应',
          columns: effectColumns,
          rows: absorbed.groups,
        },
        ...(droppedFeatures.length > 0
          ? [
              {
                id: 'dropped',
                title: '共线变量处理',
                columns: droppedColumns,
                rows: droppedFeatures.map((variable) => ({ variable: regressors[absorbed.features.indexOf(variable)] ?? variable, reason: '固定效应吸收后共线' })),
              },
            ]
          : []),
        {
          id: 'coefficients',
          title: `reghdfe 系数 (${config.target})`,
          columns: olsCoefficientColumns,
          rows: fit.coefficients.map((row) => ({
            ...row,
            term: regressors[absorbed.features.indexOf(row.term)] ?? row.term,
          })),
        },
        residualDiagnosticsTable,
        ...(robustnessTable ? [robustnessTable] : []),
      ],
      diagnostics: [],
      warnings: fit.warnings,
      message: `reghdfe 当前使用迭代去均值吸收多重固定效应；${
        droppedFeatures.length > 0 ? `已自动剔除共线变量：${droppedFeatures.join(', ')}。` : ''
      }已输出固定效应组结构和吸收自由度。`,
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
