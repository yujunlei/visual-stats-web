import { csvSummarySection, csvTableSection } from '../shared/csv'
import { toNumber } from '../../data/tableUtils'
import { compactConfig, paramArray, paramString } from '../shared/config'
import { absorbFixedEffects, formatXtregCommand } from '../shared/fixedEffects'
import { createResidualDiagnosticsTable, createRobustnessTable } from '../shared/postEstimation'
import { fitOlsDroppingCollinear, olsCoefficientColumns } from '../shared/regression'
import type { InferenceConfig, ModelPlugin, ModelResult } from '../types'

const effectColumns = ['effect', 'groups', 'singletonGroups', 'minObs', 'maxObs', 'avgObs', 'absorbedDf']
const droppedColumns = ['variable', 'reason']

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const squaredCorrelation = (left: number[], right: number[]) => {
  if (left.length !== right.length || left.length === 0) return 0
  const leftMean = mean(left)
  const rightMean = mean(right)
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0)
  const leftSst = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0)
  const rightSst = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0)
  if (leftSst === 0 || rightSst === 0) return 0
  return (numerator ** 2) / (leftSst * rightSst)
}

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
    level: 'stable',
    label: '稳定',
    description: '已支持组内固定效应估计、普通/稳健/聚类标准误和固定效应摘要。',
  },
  limitations: ['xtreg 当前支持固定效应组内估计；随机效应、Hausman 检验和完整面板后估计命令不在本模型内。'],
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
    return formatXtregCommand(config.target, regressors, panelId)
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

    const effectiveInference: InferenceConfig | undefined =
      inference?.standardError === 'robust'
        ? { standardError: 'cluster', clusterField: panelId }
        : inference
    const preserveColumns = Array.from(
      new Set([
        ...(inference?.standardError === 'robust' ? [panelId] : []),
        ...(inference?.standardError === 'cluster' && inference.clusterField ? [inference.clusterField] : []),
      ]),
    )
    const absorbed = absorbFixedEffects({
      rows,
      target: config.target,
      regressors,
      fixedEffects: [panelId],
      prefix: 'within',
      preserveColumns,
    })
    const groupCount = absorbed.groups[0]?.groups ?? 0
    const fitOptions = (activeFeatures: string[]) => ({
      includeIntercept: false,
      dfResidualOverride: absorbed.observations - groupCount - activeFeatures.length,
      inferenceDfOverride: effectiveInference?.standardError === 'cluster' ? Math.max(groupCount - 1, 1) : undefined,
      robustUsesNormal: false,
    })
    const { fit, droppedFeatures } = fitOlsDroppingCollinear(absorbed.rows, absorbed.target, absorbed.features, this.name, effectiveInference, fitOptions)
    const residualDiagnosticsTable = createResidualDiagnosticsTable(absorbed.rows, absorbed.target, absorbed.features, fit)
    const robustnessTable = createRobustnessTable(absorbed.rows, { target: absorbed.target, features: absorbed.features }, undefined, inference)
    const coefficientRows = fit.coefficients
      .filter((row) => row.term !== '_cons')
      .map((row) => ({
        ...row,
        term: regressors[absorbed.features.indexOf(row.term)] ?? row.term,
      }))
    const singletonGroups = absorbed.groups[0]?.singletonGroups ?? 0
    const groupSummary = absorbed.groups[0]
    const coefficientByFeature = new Map(fit.featureNames.map((feature, index) => [feature, fit.beta[index]]))
    const cleanRows = rows.flatMap((row) => {
      const y = toNumber(row[config.target])
      const x = regressors.map((regressor) => toNumber(row[regressor]))
      const panel = String(row[panelId] ?? '')
      if (y === null || x.some((value) => value === null) || !panel) return []
      const numericX = x as number[]
      const xb = absorbed.features.reduce((sum, transformedFeature, index) => sum + (coefficientByFeature.get(transformedFeature) ?? 0) * numericX[index], 0)
      return [{ panel, y, xb }]
    })
    const overallR2 = squaredCorrelation(
      cleanRows.map((row) => row.y),
      cleanRows.map((row) => row.xb),
    )
    const panelMeans = Array.from(
      cleanRows.reduce((groups, row) => {
        const entry = groups.get(row.panel) ?? { y: [] as number[], xb: [] as number[] }
        entry.y.push(row.y)
        entry.xb.push(row.xb)
        groups.set(row.panel, entry)
        return groups
      }, new Map<string, { y: number[]; xb: number[] }>()),
    ).map(([, entry]) => ({ y: mean(entry.y), xb: mean(entry.xb) }))
    const betweenR2 = squaredCorrelation(
      panelMeans.map((row) => row.y),
      panelMeans.map((row) => row.xb),
    )
    const sigmaE = fit.rootMse
    const panelEffects = panelMeans.map((row) => row.y - row.xb)
    const sigmaU = panelEffects.length > 1 ? Math.sqrt(Math.max(panelEffects.reduce((sum, value) => sum + (value - mean(panelEffects)) ** 2, 0) / (panelEffects.length - 1), 0)) : 0
    const rho = sigmaU ** 2 + sigmaE ** 2 === 0 ? 0 : sigmaU ** 2 / (sigmaU ** 2 + sigmaE ** 2)
    const corrUiXb = panelEffects.length > 1 ? Math.sign(panelEffects.reduce((sum, value, index) => sum + (value - mean(panelEffects)) * (panelMeans[index].xb - mean(panelMeans.map((row) => row.xb))), 0)) * Math.sqrt(betweenR2) : 0
    const warnings = [
      ...fit.warnings,
      ...(singletonGroups > 0 ? [`Panel ID 中存在 ${singletonGroups} 个 singleton 组；当前保留这些观测并在组内变换后参与估计。`] : []),
      ...(!absorbed.converged ? [`固定效应吸收在 ${absorbed.iterations} 次迭代后仍未达到默认收敛阈值。`] : []),
    ]

    return {
      id: this.id,
      summary: [
        { label: 'Number of obs', value: absorbed.observations },
        { label: 'Number of groups', value: groupCount },
        { label: 'Obs per group min', value: groupSummary?.minObs ?? 0 },
        { label: 'Obs per group avg', value: groupSummary?.avgObs ?? 0 },
        { label: 'Obs per group max', value: groupSummary?.maxObs ?? 0 },
        { label: 'Singleton groups', value: singletonGroups },
        { label: 'Absorbed df', value: absorbed.absorbedDf },
        { label: 'Residual df', value: fit.dfResidual },
        { label: 'FE iterations', value: absorbed.iterations },
        { label: 'FE converged', value: absorbed.converged ? 'Yes' : 'No' },
        { label: 'FE max delta', value: absorbed.maxDelta },
        { label: `F(${fit.dfModel}, ${fit.inferenceDf})`, value: fit.fValue },
        { label: 'Prob > F', value: fit.fPValue },
        { label: 'Within R2', value: fit.r2 },
        { label: 'Between R2', value: betweenR2 },
        { label: 'Overall R2', value: overallR2 },
        { label: 'corr(u_i, Xb)', value: corrUiXb },
        { label: 'sigma_u', value: sigmaU },
        { label: 'sigma_e', value: sigmaE },
        { label: 'rho', value: rho },
        { label: 'Root MSE', value: fit.rootMse },
        { label: 'Std. error', value: inference?.standardError === 'robust' ? `Robust (cluster ${panelId})` : fit.standardError === 'cluster' ? `Cluster ${fit.clusterField}` : fit.standardError },
        { label: 'Stata command', value: formatXtregCommand(config.target, regressors, panelId, inference) },
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
          rows: coefficientRows,
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
      warnings,
      message: `xtreg 当前采用组内去均值固定效应估计；${
        droppedFeatures.length > 0 ? `已自动剔除共线变量：${droppedFeatures.join(', ')}。` : ''
      }固定效应模型不报告普通截距项，系数表仅展示组内变换后的解释变量。`,
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
