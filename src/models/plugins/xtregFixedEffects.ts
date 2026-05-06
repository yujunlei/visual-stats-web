import { csvSummarySection, csvTableSection } from '../shared/csv'
import { compactConfig, paramArray, paramString } from '../shared/config'
import { absorbFixedEffects } from '../shared/fixedEffects'
import { createResidualDiagnosticsTable, createRobustnessTable } from '../shared/postEstimation'
import { fitOlsDroppingCollinear, olsCoefficientColumns } from '../shared/regression'
import type { ModelPlugin, ModelResult } from '../types'

const effectColumns = ['effect', 'groups', 'singletonGroups', 'minObs', 'maxObs', 'avgObs', 'absorbedDf']
const droppedColumns = ['variable', 'reason']

export const xtregFixedEffectsPlugin: ModelPlugin = {
  id: 'xtreg-fixed-effects',
  name: '面板固定效应',
  nodeLabel: '面板固定效应',
  panelLabel: 'xtreg',
  resultLabel: '固定效应系数',
  description: 'Stata xtreg, fe 风格的组内估计。显式选择面板 ID 和解释变量。',
  methodLabel: 'Within FE',
  shortName: 'XTREG',
  fullName: 'Panel Fixed Effects Regression',
  category: '面板模型',
  keywords: ['xtreg', 'fe', 'fixed effects', 'panel', '面板', '固定效应', '组内估计'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '已支持组内固定效应估计、聚类稳健标准误和固定效应摘要。',
  },
  limitations: ['xtreg 当前尚未实现随机效应、Hausman 检验和完整面板后估计命令。'],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: 'Panel ID、解释变量 X',
  downloadName: 'xtreg-fixed-effects-report.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: ['numeric', 'category'],
  includeDimensionFields: true,
  usesRawRows: true,
  supportsInference: true,
  parameterSchema: [
    { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'panelId', label: 'Panel ID', kind: 'column', role: 'feature', columnTypes: ['numeric', 'category'], required: true },
    { id: 'regressors', label: '解释变量 X', kind: 'columns', role: 'feature', columnTypes: ['numeric'], required: true },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const target = targetColumns[0] ?? ''
    const panelId = featureColumns.find((column) => column !== target) ?? ''
    const regressors = featureColumns.filter((column) => column !== target && column !== panelId).slice(0, 4)
    const params = { target, panelId, regressors }

    return compactConfig(target, params, [panelId, ...regressors])
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const targetCandidate = paramString(config, 'target', config.target)
    const target = targetColumns.includes(targetCandidate) ? targetCandidate : targetColumns[0] ?? ''
    const fallbackFeatures = config.features.filter((feature) => featureColumns.includes(feature) && feature !== target)
    const panelCandidate = paramString(config, 'panelId', fallbackFeatures[0])
    const panelId = featureColumns.includes(panelCandidate) && panelCandidate !== target ? panelCandidate : ''
    const regressors = paramArray(config, 'regressors', fallbackFeatures.slice(1))
      .filter((feature) => featureColumns.includes(feature) && ![target, panelId].includes(feature))
      .slice(0, 7)

    return compactConfig(target, { target, panelId, regressors }, [panelId, ...regressors])
  },

  getFormula(config) {
    const panelId = paramString(config, 'panelId', config.features[0] ?? 'id')
    const regressors = paramArray(config, 'regressors', config.features.slice(1))
    return `xtreg ${config.target || 'y'} ${regressors.join(' ') || 'x'}, fe i(${panelId})`
  },

  getSettings(config) {
    const regressors = paramArray(config, 'regressors', config.features.slice(1))
    return [
      { label: '面板 ID', value: paramString(config, 'panelId', config.features[0]) || '未选择' },
      { label: '估计方法', value: this.methodLabel },
      { label: '解释变量数', value: String(regressors.length) },
    ]
  },

  fit({ rows, config, inference }) {
    const panelId = paramString(config, 'panelId', config.features[0])
    const regressors = paramArray(config, 'regressors', config.features.slice(1))
    if (!config.target || !panelId || regressors.length === 0) {
      throw new Error('xtreg 需要选择 Y、Panel ID 和至少一个解释变量。')
    }

    const absorbed = absorbFixedEffects({
      rows,
      target: config.target,
      regressors,
      fixedEffects: [panelId],
      prefix: 'within',
      preserveColumns: inference?.standardError === 'cluster' && inference.clusterField ? [inference.clusterField] : [],
    })
    const { fit, droppedFeatures } = fitOlsDroppingCollinear(absorbed.rows, absorbed.target, absorbed.features, this.name, inference)
    const residualDiagnosticsTable = createResidualDiagnosticsTable(absorbed.rows, absorbed.target, absorbed.features, fit)
    const robustnessTable = createRobustnessTable(absorbed.rows, { target: absorbed.target, features: absorbed.features }, undefined, inference)

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: absorbed.observations },
        { label: 'Number of groups', value: absorbed.groups[0]?.groups ?? 0 },
        { label: 'Singleton groups', value: absorbed.groups[0]?.singletonGroups ?? 0 },
        { label: 'Absorbed df', value: absorbed.absorbedDf },
        { label: 'F statistic', value: fit.fValue },
        { label: 'Prob > F', value: fit.fPValue },
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
          title: `xtreg, fe 系数 (${config.target})`,
          columns: olsCoefficientColumns,
          rows: fit.coefficients.map((row) => ({
            ...row,
            term: regressors[absorbed.features.indexOf(row.term)] ?? row.term,
          })),
        },
        residualDiagnosticsTable,
        ...(robustnessTable ? [robustnessTable] : []),
      ],
      diagnostics: [
        {
          id: 'within-actual-vs-fitted',
          title: '组内拟合诊断',
          kind: 'actual-vs-fitted',
          actual: fit.actual,
          fitted: fit.fitted,
        },
      ],
      warnings: fit.warnings,
      message: `xtreg 当前采用组内去均值固定效应估计；${
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
