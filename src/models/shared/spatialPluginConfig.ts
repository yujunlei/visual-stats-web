import { compactConfig, paramArray, paramString } from './config'
import { isSpatialWeightsParam, safeSpatialName, type SpatialContext, type SpatialModelKind } from './spatialContext'
import type { ModelConfig, ModelParamValue, ModelPlugin, ModelResultTable } from '../types'

export type SpatialSpec = {
  id: string
  name: string
  panelLabel: string
  resultLabel: string
  description: string
  methodLabel: string
  shortName: string
  fullName: string
  keywords: string[]
  kind: SpatialModelKind
  message: string
}

const spatialColumns = [
  'model',
  'spatialKey',
  'neighborKey',
  'weightField',
  'specification',
  'spatialTerms',
  'validWeights',
  'nodes',
  'weightNodes',
  'matchedNodes',
  'validEdges',
  'isolatedNodes',
  'matchRate',
  'rowStandardized',
  'rSquared',
  'rootMse',
]

export const droppedColumns = ['variable', 'reason']
export const effectColumns = ['effect', 'groups', 'singletonGroups', 'minObs', 'maxObs', 'avgObs', 'absorbedDf']
export const logitCoefficientColumns = ['term', 'coefficient', 'stdError', 'tValue', 'pValue', 'ciLow', 'ciHigh', 'oddsRatio']

export const baseSpatialParameterSchema: NonNullable<ModelPlugin['parameterSchema']> = [
  { id: 'target', label: '因变量 Y', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
  { id: 'spatialKey', label: '空间键 / 区域 ID', kind: 'column', role: 'feature', columnTypes: ['numeric', 'category'], required: true },
  {
    id: 'neighborKey',
    label: '邻接目标字段',
    kind: 'column',
    role: 'feature',
    columnTypes: ['numeric', 'category'],
    helperText: '可选；若数据中有 from/to/weight 边表结构，选择 to 字段。',
  },
  { id: 'weightField', label: '权重字段', kind: 'column', role: 'feature', columnTypes: ['numeric'], helperText: '可选；与邻接目标字段一起生成加权 W。' },
  {
    id: 'spatialWeights',
    label: '独立空间权重文件 W',
    kind: 'file',
    accept: '.csv,.txt,.gal,.gwt,text/csv,text/plain',
    helperText: '可选；支持 edge-list: from/to/weight、GAL/GWT，或第一行/第一列为空间 ID 的方阵 CSV。',
  },
  { id: 'controls', label: '解释变量 / 控制变量 X', kind: 'columns', role: 'feature', columnTypes: ['numeric'] },
]

export const panelSpatialParameterSchema: NonNullable<ModelPlugin['parameterSchema']> = [
  ...baseSpatialParameterSchema,
  { id: 'panelId', label: 'Panel ID 固定效应', kind: 'column', role: 'feature', columnTypes: ['numeric', 'category'], required: true },
  { id: 'timeField', label: 'Time 固定效应', kind: 'column', role: 'feature', columnTypes: ['numeric', 'category'] },
]

export const makeDefaultSpatialConfig = (featureColumns: string[], targetColumns = featureColumns, kind: SpatialModelKind) => {
  const target = targetColumns[0] ?? ''
  const candidates = featureColumns.filter((column) => column !== target)
  const spatialKey = candidates[0] ?? ''
  const panelId = candidates.find((column) => column !== spatialKey) ?? ''
  const controls = targetColumns.filter((column) => ![target, spatialKey, panelId].includes(column)).slice(0, 4)
  const params: Record<string, ModelParamValue> = {
    target,
    spatialKey,
    neighborKey: '',
    weightField: '',
    spatialWeights: '',
    controls,
  }

  if (kind === 'panel-sdm') {
    params.panelId = panelId
    params.timeField = ''
  }

  return compactConfig(target, params, [spatialKey, panelId, ...controls])
}

export const sanitizeSpatialConfig = (config: ModelConfig, featureColumns: string[], targetColumns = featureColumns, kind: SpatialModelKind) => {
  const targetCandidate = paramString(config, 'target', config.target)
  const target = targetColumns.includes(targetCandidate) ? targetCandidate : targetColumns[0] ?? ''
  const fallbackFeatures = config.features.filter((feature) => featureColumns.includes(feature) && feature !== target)
  const spatialKeyCandidate = paramString(config, 'spatialKey', fallbackFeatures[0])
  const spatialKey = featureColumns.includes(spatialKeyCandidate) && spatialKeyCandidate !== target ? spatialKeyCandidate : ''
  const neighborKeyCandidate = paramString(config, 'neighborKey')
  const neighborKey = featureColumns.includes(neighborKeyCandidate) && ![target, spatialKey].includes(neighborKeyCandidate) ? neighborKeyCandidate : ''
  const weightFieldCandidate = paramString(config, 'weightField')
  const weightField = featureColumns.includes(weightFieldCandidate) && ![target, spatialKey, neighborKey].includes(weightFieldCandidate) ? weightFieldCandidate : ''
  const panelCandidate = paramString(config, 'panelId', fallbackFeatures.find((feature) => ![spatialKey, neighborKey, weightField].includes(feature)))
  const panelId = kind === 'panel-sdm' && featureColumns.includes(panelCandidate) && ![target, spatialKey, neighborKey, weightField].includes(panelCandidate) ? panelCandidate : ''
  const timeCandidate = paramString(config, 'timeField')
  const timeField = kind === 'panel-sdm' && featureColumns.includes(timeCandidate) && ![target, spatialKey, neighborKey, weightField, panelId].includes(timeCandidate) ? timeCandidate : ''
  const excluded = [target, spatialKey, neighborKey, weightField, panelId, timeField]
  const controls = paramArray(config, 'controls', fallbackFeatures)
    .filter((feature) => targetColumns.includes(feature) && !excluded.includes(feature))
    .slice(0, 7)
  const spatialWeights = isSpatialWeightsParam(config.params?.spatialWeights) ? config.params.spatialWeights : ''
  const params: Record<string, ModelParamValue> = { target, spatialKey, neighborKey, weightField, spatialWeights, controls }

  if (kind === 'panel-sdm') {
    params.panelId = panelId
    params.timeField = timeField
  }

  return compactConfig(target, params, [spatialKey, neighborKey, weightField, panelId, timeField, ...controls])
}

export const getSpatialFormula = (kind: SpatialModelKind, config: ModelConfig) => {
  const controls = paramArray(config, 'controls', config.features.slice(1))
  const x = controls.join(' + ') || 'X'
  const panelId = paramString(config, 'panelId')
  const timeField = paramString(config, 'timeField')

  if (kind === 'sar') return `${config.target || 'y'} = rho*Wy + ${x}`
  if (kind === 'slx') return `${config.target || 'y'} = ${x} + theta*WX`
  if (kind === 'sdm') return `${config.target || 'y'} = rho*Wy + ${x} + theta*WX`
  if (kind === 'sem') return `${config.target || 'y'} = ${x}, u = lambda*Wu + e`
  if (kind === 'sdem') return `${config.target || 'y'} = ${x} + theta*WX, u = lambda*Wu + e`
  if (kind === 'sac') return `${config.target || 'y'} = rho*Wy + ${x}, u = lambda*Wu + e`
  if (kind === 'gns') return `${config.target || 'y'} = rho*Wy + ${x} + theta*WX, u = lambda*Wu + e`
  if (kind === 'panel-sdm') return `${config.target || 'y'} = rho*Wy + ${x} + theta*WX + FE(${[panelId, timeField].filter(Boolean).join(', ') || 'panel'})`
  return `logit(${config.target || 'y'}) = rho*Wy + ${x} + theta*WX`
}

export const getSpatialSettings = (config: ModelConfig, methodLabel: string) => {
  const controls = paramArray(config, 'controls', config.features.slice(1))
  const neighborKey = paramString(config, 'neighborKey')
  const weightField = paramString(config, 'weightField')

  return [
    { label: '估计方法', value: methodLabel },
    { label: '空间键', value: paramString(config, 'spatialKey', config.features[0]) || '未选择' },
    { label: '权重矩阵', value: isSpatialWeightsParam(config.params?.spatialWeights) ? `独立文件 ${config.params.spatialWeights.fileName}` : neighborKey && weightField ? `边表权重 ${weightField}` : '排序邻近 W' },
    { label: '控制变量数', value: String(controls.length) },
  ]
}

export const formatSpatialTerm = (term: string, config: ModelConfig) => {
  if (term === safeSpatialName('W', config.target)) return `W_${config.target}`
  if (term === safeSpatialName('W', safeSpatialName('e', config.target))) return 'W_residual'
  if (term.startsWith('W_')) return term
  return term
}

export const spatialSetupTable = (
  spec: SpatialSpec,
  context: SpatialContext,
  config: ModelConfig,
  spatialKey: string,
  neighborKey: string,
  weightField: string,
  spatialTerms: string[],
  fit?: { r2: number; rootMse: number },
): ModelResultTable => ({
  id: 'spatial-setup',
  title: '空间权重与模型设定',
  columns: spatialColumns,
  rows: [
    {
      model: spec.shortName,
      spatialKey,
      neighborKey: neighborKey || 'NA',
      weightField: weightField || 'NA',
      specification: getSpatialFormula(spec.kind, config),
      spatialTerms: spatialTerms.join(', ') || 'NA',
      validWeights: context.validWeights,
      nodes: context.diagnostics.nodes,
      weightNodes: context.diagnostics.weightNodes,
      matchedNodes: context.diagnostics.matchedNodes,
      validEdges: context.diagnostics.validEdges,
      isolatedNodes: context.diagnostics.isolatedNodes,
      matchRate: context.diagnostics.sampleMatchRate,
      rowStandardized: context.diagnostics.rowStandardized ? 'Yes' : 'No',
      rSquared: fit?.r2 ?? 'NA',
      rootMse: fit?.rootMse ?? 'NA',
    },
  ],
})

export const isSpatialMlKind = (kind: SpatialModelKind) => ['sar', 'sdm', 'sem', 'sdem', 'sac', 'gns'].includes(kind)

export const spatialMlFeatures = (kind: SpatialModelKind, controls: string[], wx: string[]) => {
  if (kind === 'sar' || kind === 'sem' || kind === 'sac') return controls
  if (kind === 'sdm' || kind === 'sdem' || kind === 'gns') return [...controls, ...wx]
  return undefined
}

export const spatialSpecs: SpatialSpec[] = [
  {
    id: 'spatial-sar',
    name: '空间滞后模型',
    panelLabel: 'Spatial Lag Model',
    resultLabel: 'SAR 系数',
    description: '包含因变量空间滞后项 Wy 的空间自回归模型。',
    methodLabel: 'Spatial Lag OLS',
    shortName: 'SAR',
    fullName: 'Spatial Autoregressive / Spatial Lag Model',
    keywords: ['spatial', 'sar', 'slm', '空间滞后', '空间自回归'],
    kind: 'sar',
    message: 'SAR 用于检验相邻地区因变量的空间溢出。',
  },
  {
    id: 'spatial-slx',
    name: '空间滞后解释变量模型',
    panelLabel: 'Spatial Lag of X',
    resultLabel: 'SLX 系数',
    description: '包含解释变量空间滞后项 WX，适合估计外部解释变量的空间溢出。',
    methodLabel: 'SLX OLS',
    shortName: 'SLX',
    fullName: 'Spatial Lag of X Model',
    keywords: ['spatial', 'slx', 'wx', '空间解释变量滞后'],
    kind: 'slx',
    message: 'SLX 用于估计解释变量的邻近影响。',
  },
  {
    id: 'spatial-sdm',
    name: '空间杜宾模型',
    panelLabel: 'Spatial Durbin Model',
    resultLabel: 'SDM 系数',
    description: '同时包含 Wy 和 WX，是应用最广的空间溢出基准模型之一。',
    methodLabel: 'Spatial Durbin OLS',
    shortName: 'SDM',
    fullName: 'Spatial Durbin Model',
    keywords: ['spatial', 'sdm', 'durbin', '空间杜宾'],
    kind: 'sdm',
    message: 'SDM 同时展示因变量和解释变量的空间溢出。',
  },
  {
    id: 'spatial-sem',
    name: '空间误差模型',
    panelLabel: 'Spatial Error Model',
    resultLabel: 'SEM 系数',
    description: '用空间滞后残差 Wu 近似刻画误差项空间相关。',
    methodLabel: 'Spatial Error Approx.',
    shortName: 'SEM',
    fullName: 'Spatial Error Model',
    keywords: ['spatial', 'sem', 'error', '空间误差'],
    kind: 'sem',
    message: 'SEM 用于识别遗漏空间因素导致的误差相关。',
  },
  {
    id: 'spatial-sdem',
    name: '空间杜宾误差模型',
    panelLabel: 'Spatial Durbin Error Model',
    resultLabel: 'SDEM 系数',
    description: '同时包含 WX 和空间误差项 Wu。',
    methodLabel: 'SDEM Approx.',
    shortName: 'SDEM',
    fullName: 'Spatial Durbin Error Model',
    keywords: ['spatial', 'sdem', 'durbin error', '空间杜宾误差'],
    kind: 'sdem',
    message: 'SDEM 同时刻画解释变量溢出和误差项空间相关。',
  },
  {
    id: 'spatial-sac',
    name: '空间自回归组合模型',
    panelLabel: 'Spatial SAC / SARAR',
    resultLabel: 'SAC 系数',
    description: '同时包含 Wy 和空间误差项 Wu，也常称 SARAR。',
    methodLabel: 'SAC Approx.',
    shortName: 'SAC',
    fullName: 'Spatial Autoregressive Combined / SARAR Model',
    keywords: ['spatial', 'sac', 'sarar', '空间组合模型'],
    kind: 'sac',
    message: 'SAC/SARAR 同时刻画因变量空间滞后和误差空间相关。',
  },
  {
    id: 'spatial-gns',
    name: '一般嵌套空间模型',
    panelLabel: 'General Nesting Spatial',
    resultLabel: 'GNS 系数',
    description: '同时包含 Wy、WX 和 Wu，可作为 SAR/SDM/SEM/SAC 的上位嵌套原型。',
    methodLabel: 'GNS Approx.',
    shortName: 'GNS',
    fullName: 'General Nesting Spatial Model',
    keywords: ['spatial', 'gns', 'general nesting', '一般嵌套空间模型'],
    kind: 'gns',
    message: 'GNS 是最完整的常见空间计量嵌套设定。',
  },
  {
    id: 'spatial-panel-sdm',
    name: '空间面板杜宾模型',
    panelLabel: 'Spatial Panel SDM',
    resultLabel: '空间面板系数',
    description: '在 SDM 空间滞后项基础上吸收 Panel ID / Time 固定效应。',
    methodLabel: 'Panel SDM FE',
    shortName: 'SP-SDM',
    fullName: 'Spatial Panel Durbin Model with Fixed Effects',
    keywords: ['spatial', 'panel', 'sdm', 'fixed effects', '空间面板'],
    kind: 'panel-sdm',
    message: '空间面板 SDM 用于面板数据中的空间溢出和个体/时间固定效应。',
  },
  {
    id: 'spatial-logit',
    name: '空间 LOGIT 模型',
    panelLabel: 'Spatial Logit',
    resultLabel: '空间 Logit 系数',
    description: '在二分类 Logit 中加入 Wy 与 WX 空间滞后解释项。',
    methodLabel: 'Spatial Logit Approx.',
    shortName: 'S-LOGIT',
    fullName: 'Spatial Logistic Regression',
    keywords: ['spatial', 'logit', 'binary', '空间logit'],
    kind: 'spatial-logit',
    message: '空间 Logit 用于二分类因变量下的邻近影响分析。',
  },
]
