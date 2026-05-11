import { csvSummarySection, csvTableSection } from '../shared/csv'
import { compactConfig, paramArray, paramString } from '../shared/config'
import { absorbFixedEffects, formatReghdfeCommand, nestedFixedEffectsInCluster } from '../shared/fixedEffects'
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
    level: 'stable',
    label: '稳定',
    description: '已支持多维固定效应吸收、共线变量剔除、普通/稳健/聚类标准误和固定效应摘要。',
  },
  limitations: ['reghdfe 当前支持多维固定效应吸收和单向聚类；多向聚类和 Stata reghdfe 的完整自由度修正不在本模型内。'],
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
    return formatReghdfeCommand(config.target, regressors, effects)
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
      dropSingletons: true,
    })
    const nestedEffects = nestedFixedEffectsInCluster(absorbed.sourceRows, fixedEffects, inference?.standardError === 'cluster' ? inference.clusterField : undefined)
    const nestedAbsorbedDf = absorbed.groups.filter((group) => nestedEffects.includes(group.effect)).reduce((sum, group) => sum + group.absorbedDf, 0)
    const effectiveAbsorbedDf = Math.max(absorbed.absorbedDf - nestedAbsorbedDf, 0)
    const clusterCount =
      inference?.standardError === 'cluster' && inference.clusterField
        ? new Set(absorbed.rows.map((row) => String(row[inference.clusterField] ?? '__missing__'))).size
        : undefined
    const fitOptions = (activeFeatures: string[]) => ({
      includeIntercept: false,
      dfResidualOverride: absorbed.observations - effectiveAbsorbedDf - activeFeatures.length,
      inferenceDfOverride: clusterCount ? Math.max(clusterCount - 1, 1) : undefined,
      robustUsesNormal: false,
    })
    const { fit, droppedFeatures } = fitOlsDroppingCollinear(absorbed.rows, absorbed.target, absorbed.features, this.name, inference, fitOptions)
    const residualDiagnosticsTable = createResidualDiagnosticsTable(absorbed.rows, absorbed.target, absorbed.features, fit)
    const robustnessTable = createRobustnessTable(absorbed.rows, { target: absorbed.target, features: absorbed.features }, undefined, inference)
    const coefficientRows = fit.coefficients
      .filter((row) => row.term !== '_cons')
      .map((row) => ({
        ...row,
        term: regressors[absorbed.features.indexOf(row.term)] ?? row.term,
      }))
    const singletonGroups = absorbed.groups.reduce((sum, entry) => sum + entry.singletonGroups, 0)
    const warnings = [
      ...fit.warnings,
      ...(absorbed.droppedSingletonRows > 0 ? [`reghdfe 默认口径已递归删除 ${absorbed.droppedSingletonRows} 条 singleton 观测。`] : []),
      ...(nestedEffects.length > 0 ? [`固定效应 ${nestedEffects.join(', ')} 嵌套在聚类字段内，DoF 惩罚已按 reghdfe 文档口径避免重复扣除。`] : []),
      ...(singletonGroups > 0 ? [`吸收固定效应中存在 ${singletonGroups} 个 singleton 组；当前保留这些观测并在吸收变换后参与估计。`] : []),
      ...(!absorbed.converged ? [`固定效应吸收在 ${absorbed.iterations} 次迭代后仍未达到默认收敛阈值。`] : []),
    ]

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: absorbed.observations },
        { label: 'Absorbed FE', value: fixedEffects.length },
        { label: 'Absorbed df', value: absorbed.absorbedDf },
        { label: 'Nested absorbed df', value: nestedAbsorbedDf },
        { label: 'Effective absorbed df', value: effectiveAbsorbedDf },
        { label: 'Residual df', value: fit.dfResidual },
        { label: 'Dropped singleton obs', value: absorbed.droppedSingletonRows },
        { label: 'Singleton groups', value: singletonGroups },
        { label: 'FE iterations', value: absorbed.iterations },
        { label: 'FE converged', value: absorbed.converged ? 'Yes' : 'No' },
        { label: 'FE max delta', value: absorbed.maxDelta },
        { label: `F(${fit.dfModel}, ${fit.inferenceDf})`, value: fit.fValue },
        { label: 'Prob > F', value: fit.fPValue },
        { label: 'Within R2', value: fit.r2 },
        { label: 'Root MSE', value: fit.rootMse },
        { label: 'Std. error', value: fit.standardError === 'cluster' ? `Cluster ${fit.clusterField}` : fit.standardError },
        { label: 'Stata command', value: formatReghdfeCommand(config.target, regressors, fixedEffects, inference) },
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
          rows: coefficientRows,
        },
        residualDiagnosticsTable,
        ...(robustnessTable ? [robustnessTable] : []),
      ],
      diagnostics: [],
      warnings,
      message: `reghdfe 当前使用迭代去均值吸收多重固定效应；${
        droppedFeatures.length > 0 ? `已自动剔除共线变量：${droppedFeatures.join(', ')}。` : ''
      }固定效应模型不报告普通截距项，系数表仅展示吸收变换后的解释变量。`,
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
