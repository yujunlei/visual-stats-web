import type { ColumnType, Row } from '../data/types'

export type SpatialWeightsParam = {
  kind: 'spatial-weights'
  fileName: string
  format: 'edge-list' | 'matrix'
  edges?: Array<{ from: string; to: string; weight: number }>
  nodes?: string[]
  matrix?: number[][]
  summary: string
}

export type ModelParamValue = string | string[] | number | SpatialWeightsParam

export type ModelConfig = {
  target: string
  features: string[]
  params?: Record<string, ModelParamValue>
}

export type ModelMetric = {
  label: string
  value: string | number
  precision?: number
}

export type InferenceConfig = {
  standardError: 'ols' | 'robust' | 'cluster'
  clusterField: string
}

export type ModelResultTable = {
  id: string
  title: string
  columns: string[]
  rows: Array<Record<string, string | number>>
}

export type ActualVsFittedDiagnostic = {
  id: string
  title: string
  kind: 'actual-vs-fitted'
  actual: number[]
  fitted: number[]
}

export type CorrelationMatrixDiagnostic = {
  id: string
  title: string
  kind: 'correlation-matrix'
  variables: string[]
  matrix: number[][]
}

export type ModelDiagnostic = ActualVsFittedDiagnostic | CorrelationMatrixDiagnostic

export type ModelResult = {
  id: string
  summary: ModelMetric[]
  tables: ModelResultTable[]
  diagnostics: ModelDiagnostic[]
  warnings?: string[]
  message: string
}

export type ModelFitInput = {
  rows: Row[]
  config: ModelConfig
  inference?: InferenceConfig
}

export type ModelPlugin = {
  id: string
  name: string
  nodeLabel: string
  panelLabel: string
  resultLabel: string
  description: string
  methodLabel: string
  shortName: string
  fullName: string
  category: string
  keywords: string[]
  maturity?: {
    level: 'stable' | 'preview' | 'prototype'
    label: string
    description: string
  }
  limitations?: string[]
  requiresTarget: boolean
  targetLabel: string
  featuresLabel: string
  downloadName: string
  supportsCategoricalFeatures: boolean
  supportedFeatureTypes?: ColumnType[]
  includeDimensionFields?: boolean
  usesRawRows?: boolean
  supportsInference?: boolean
  parameterSchema?: Array<{
    id: string
    label: string
    kind: 'column' | 'columns' | 'number' | 'file'
    columnTypes?: ColumnType[]
    role?: 'target' | 'feature'
    required?: boolean
    maxSelections?: number
    helperText?: string
    defaultValue?: number
    accept?: string
  }>
  getDefaultConfig(featureColumns: string[], targetColumns?: string[]): ModelConfig
  sanitizeConfig(config: ModelConfig, featureColumns: string[], targetColumns?: string[]): ModelConfig
  getFormula(config: ModelConfig): string
  getSettings(config: ModelConfig): Array<{ label: string; value: string }>
  fit(input: ModelFitInput): ModelResult
  exportCsv(result: ModelResult, config: ModelConfig): string
}

export type ModelPackId = 'core' | 'advanced' | 'experimental'

export type ModelTaskGroup =
  | '数据探索'
  | '问卷研究'
  | '差异检验'
  | '相关关系'
  | '回归建模'
  | '回归诊断'
  | '面板与固定效应'
  | '机制检验'
  | '空间与扩展模型'

export type ModelMaturityLevel = 'stable' | 'preview' | 'experimental'

export type ModelCatalogEntry = {
  id: string
  taskGroup: ModelTaskGroup
  packId: ModelPackId
  modelVersion: string
  maturityLevel: ModelMaturityLevel
  enabledByDefault: boolean
  useCase: string
  accuracyNotes: string
}
