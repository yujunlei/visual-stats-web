import { csvSummarySection, csvTableSection } from '../shared/csv'
import { paramString } from '../shared/config'
import { absorbFixedEffects } from '../shared/fixedEffects'
import { cleanNumericRows, fitLogit, fitOls, fitOlsDroppingCollinear, olsCoefficientColumns } from '../shared/regression'
import { isSpatialMlFit, spatialPostEstimationTables } from '../shared/spatialPostEstimation'
import { fitSpatialCombinedMl, fitSpatialErrorMl, fitSpatialLagMl } from '../shared/spatialEstimators'
import {
  baseSpatialParameterSchema,
  droppedColumns,
  effectColumns,
  formatSpatialTerm,
  getSpatialFormula,
  getSpatialSettings,
  isSpatialMlKind,
  logitCoefficientColumns,
  makeDefaultSpatialConfig,
  panelSpatialParameterSchema,
  sanitizeSpatialConfig,
  spatialMlFeatures,
  spatialSetupTable,
  spatialSpecs,
  type SpatialSpec,
} from '../shared/spatialPluginConfig'
import { makeSpatialRows } from '../shared/spatialContext'
import type { ModelFitInput, ModelPlugin, ModelResult } from '../types'

const fitSpatialOls = (spec: SpatialSpec, input: ModelFitInput) => {
  const spatial = makeSpatialRows(input.rows, input.config, spec.kind)
  const spatialTerms = [spatial.wy, ...spatial.wx, spatial.wu].filter(Boolean).map((term) => formatSpatialTerm(term, input.config))
  const mlFeatures = spatialMlFeatures(spec.kind, spatial.controls, spatial.wx)
  const fit =
    isSpatialMlKind(spec.kind) && mlFeatures
      ? (() => {
          const estimationRows = cleanNumericRows(spatial.rows, input.config.target, mlFeatures).map((entry) => entry.row)
          const weights = spatial.context.weightMatrixForRows(estimationRows)
          if (spec.kind === 'sar' || spec.kind === 'sdm') return fitSpatialLagMl(estimationRows, input.config.target, mlFeatures, weights, spec.name)
          if (spec.kind === 'sem' || spec.kind === 'sdem') return fitSpatialErrorMl(estimationRows, input.config.target, mlFeatures, weights, spec.name)
          return fitSpatialCombinedMl(estimationRows, input.config.target, mlFeatures, weights, spec.name)
        })()
      : fitOls(spatial.rows, input.config.target, spatial.regressors, spec.name, input.inference)
  const isMlFit = isSpatialMlFit(fit)
  const postFeatures = isSpatialMlKind(spec.kind) && mlFeatures ? mlFeatures : spatial.regressors
  const postRows = cleanNumericRows(spatial.rows, input.config.target, postFeatures).map((entry) => entry.row)
  const postWeights = spatial.context.weightMatrixForRows(postRows)

  return {
    id: spec.id,
    summary: [
      { label: 'Number of obs', value: fit.n },
      { label: 'Spatial terms', value: spatialTerms.length },
      { label: 'Weight matrix', value: spatial.context.weightMatrix },
      { label: 'Valid weights', value: spatial.context.validWeights },
      { label: 'R-squared', value: fit.r2 },
      { label: 'Adj R-squared', value: fit.adjustedR2 },
      { label: 'Root MSE', value: fit.rootMse },
      ...(isMlFit
        ? [
            { label: 'Log likelihood', value: fit.logLikelihood },
            { label: 'Estimator', value: 'Spatial ML' },
          ]
        : [{ label: 'Std. error', value: fit.standardError === 'cluster' ? `Cluster ${fit.clusterField}` : fit.standardError }]),
    ],
    tables: [
      spatialSetupTable(spec, spatial.context, input.config, spatial.spatialKey, spatial.neighborKey, spatial.weightField, spatialTerms, fit),
      {
        id: 'coefficients',
        title: `${spec.shortName} 系数估计 (${input.config.target})`,
        columns: olsCoefficientColumns,
        rows: fit.coefficients.map((row) => ({ ...row, term: formatSpatialTerm(row.term, input.config) })),
      },
      ...spatialPostEstimationTables(spec.kind, fit, postWeights, spatial.controls, spatial.wx),
    ],
    diagnostics: [
      {
        id: `${spec.id}-actual-vs-fitted`,
        title: `${spec.shortName} 拟合诊断`,
        kind: 'actual-vs-fitted',
        actual: fit.actual,
        fitted: fit.fitted,
      },
    ],
    warnings: fit.warnings,
    message: isMlFit
      ? `${spec.message} 已接入独立 W/内置 W 的空间集中最大似然估计，并输出空间效应分解与残差 Moran's I 后估计。`
      : `${spec.message} 当前模型按空间滞后解释变量构造后使用 OLS 估计；上传独立 W 文件时会优先使用文件权重。`,
  } satisfies ModelResult
}

const fitSpatialPanel = (spec: SpatialSpec, input: ModelFitInput) => {
  const spatial = makeSpatialRows(input.rows, input.config, spec.kind)
  const panelId = paramString(input.config, 'panelId')
  const timeField = paramString(input.config, 'timeField')
  const fixedEffects = [panelId, timeField].filter(Boolean)

  if (!panelId) throw new Error('空间面板模型需要选择 Panel ID。')
  if (fixedEffects.length === 0) throw new Error('空间面板模型需要至少一个固定效应字段。')

  const preserved = input.inference?.standardError === 'cluster' && input.inference.clusterField ? [input.inference.clusterField] : []
  const absorbed = absorbFixedEffects({
    rows: spatial.rows,
    target: input.config.target,
    regressors: spatial.regressors,
    fixedEffects,
    prefix: 'spfe',
    preserveColumns: preserved,
  })
  const { fit, droppedFeatures, features } = fitOlsDroppingCollinear(absorbed.rows, absorbed.target, absorbed.features, spec.name, input.inference)
  const activeTerms = fit.coefficients.map((row) => spatial.regressors[absorbed.features.indexOf(row.term)] ?? row.term)
  const spatialTerms = [spatial.wy, ...spatial.wx].filter(Boolean).map((term) => formatSpatialTerm(term, input.config))

  return {
    id: spec.id,
    summary: [
      { label: 'Number of obs', value: absorbed.observations },
      { label: 'Fixed effects', value: fixedEffects.join(', ') },
      { label: 'Spatial terms', value: spatialTerms.length },
      { label: 'Absorbed df', value: absorbed.absorbedDf },
      { label: 'Within R2', value: fit.r2 },
      { label: 'Root MSE', value: fit.rootMse },
      { label: 'Dropped terms', value: droppedFeatures.length },
    ],
    tables: [
      spatialSetupTable(spec, spatial.context, input.config, spatial.spatialKey, spatial.neighborKey, spatial.weightField, spatialTerms, fit),
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
              rows: droppedFeatures.map((variable) => ({ variable: spatial.regressors[absorbed.features.indexOf(variable)] ?? variable, reason: '固定效应吸收后共线' })),
            },
          ]
        : []),
      {
        id: 'coefficients',
        title: `${spec.shortName} 固定效应系数`,
        columns: olsCoefficientColumns,
        rows: fit.coefficients.map((row, index) => ({
          ...row,
          term: index === 0 ? '_cons' : formatSpatialTerm(activeTerms[index], input.config),
        })),
      },
    ],
    diagnostics: [
      {
        id: `${spec.id}-actual-vs-fitted`,
        title: `${spec.shortName} 组内拟合诊断`,
        kind: 'actual-vs-fitted',
        actual: fit.actual,
        fitted: fit.fitted,
      },
    ],
    warnings: [...fit.warnings, ...(features.length < absorbed.features.length ? ['固定效应估计中部分空间项因共线被自动剔除。'] : [])],
    message: `${spec.message} 当前采用先构造空间滞后项、再吸收固定效应的近似流程。`,
  } satisfies ModelResult
}

const fitSpatialLogit = (spec: SpatialSpec, input: ModelFitInput) => {
  const spatial = makeSpatialRows(input.rows, input.config, spec.kind)
  const fit = fitLogit(spatial.rows, input.config.target, spatial.regressors, spec.name)
  const spatialTerms = [spatial.wy, ...spatial.wx].filter(Boolean).map((term) => formatSpatialTerm(term, input.config))

  return {
    id: spec.id,
    summary: [
      { label: 'Number of obs', value: fit.n },
      { label: 'Positive y', value: fit.positives },
      { label: 'Negative y', value: fit.negatives },
      { label: 'Spatial terms', value: spatialTerms.length },
      { label: 'Weight matrix', value: spatial.context.weightMatrix },
      { label: 'Pseudo R2', value: fit.pseudoR2 },
      { label: 'Accuracy', value: fit.accuracy },
    ],
    tables: [
      spatialSetupTable(spec, spatial.context, input.config, spatial.spatialKey, spatial.neighborKey, spatial.weightField, spatialTerms),
      {
        id: 'coefficients',
        title: `${spec.shortName} 系数估计 (${input.config.target})`,
        columns: logitCoefficientColumns,
        rows: fit.coefficients.map((row) => ({ ...row, term: formatSpatialTerm(row.term, input.config) })),
      },
    ],
    diagnostics: [],
    message: `${spec.message} 当前为带空间滞后解释项的 Logit 原型估计，因变量数值大于 0 视为 1。`,
  } satisfies ModelResult
}

const createSpatialPlugin = (spec: SpatialSpec): ModelPlugin => ({
  id: spec.id,
  name: spec.name,
  nodeLabel: spec.name,
  panelLabel: spec.panelLabel,
  resultLabel: spec.resultLabel,
  description: spec.description,
  methodLabel: spec.methodLabel,
  shortName: spec.shortName,
  fullName: spec.fullName,
  category: '空间计量',
  keywords: [...spec.keywords, 'spatial econometrics', '空间计量', '空间权重', '空间溢出'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '使用浏览器内置空间估计实现，适合先完成空间权重与变量设定探索。',
  },
  limitations: ['当前空间估计运行在浏览器内，建议先用小字段集确认设定后再完整运行。', '当前优先支持 CSV/矩阵/边表 W，.gal/.gwt/.shp/GeoJSON 文件解析仍待增强。'],
  requiresTarget: true,
  targetLabel: spec.kind === 'spatial-logit' ? '二分类因变量 Y' : '因变量 Y',
  featuresLabel: spec.kind === 'panel-sdm' ? '空间键、面板维度、解释变量' : '空间键、解释变量',
  downloadName: `${spec.id}-report.csv`,
  supportsCategoricalFeatures: true,
  supportedFeatureTypes: ['numeric', 'category'],
  includeDimensionFields: true,
  usesRawRows: true,
  supportsInference: spec.kind !== 'spatial-logit',
  parameterSchema: spec.kind === 'panel-sdm' ? panelSpatialParameterSchema : baseSpatialParameterSchema,

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    return makeDefaultSpatialConfig(featureColumns, targetColumns, spec.kind)
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    return sanitizeSpatialConfig(config, featureColumns, targetColumns, spec.kind)
  },

  getFormula(config) {
    const spatialKey = paramString(config, 'spatialKey', config.features[0] ?? 'space_key')
    const neighborKey = paramString(config, 'neighborKey')
    const weightField = paramString(config, 'weightField')
    const weightSpec = neighborKey && weightField ? `edge ${spatialKey} -> ${neighborKey}, w=${weightField}` : `sorted neighbors by ${spatialKey}`

    return `${getSpatialFormula(spec.kind, config)} | W: ${weightSpec}`
  },

  getSettings(config) {
    const settings = getSpatialSettings(config, spec.methodLabel)
    if (spec.kind !== 'panel-sdm') return settings

    return [
      ...settings,
      { label: 'Panel ID', value: paramString(config, 'panelId') || '未选择' },
      { label: 'Time FE', value: paramString(config, 'timeField') || '未选择' },
    ]
  },

  fit(input) {
    if (spec.kind === 'panel-sdm') return fitSpatialPanel(spec, input)
    if (spec.kind === 'spatial-logit') return fitSpatialLogit(spec, input)
    return fitSpatialOls(spec, input)
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
})

export const spatialModelPlugins = spatialSpecs.map(createSpatialPlugin)
export const spatialRegressionPlugin = spatialModelPlugins[0]
