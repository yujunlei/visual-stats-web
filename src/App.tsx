import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { readSheet } from 'read-excel-file/browser'
import writeXlsxFile, { type Cell, type Sheet, type SheetData } from 'write-excel-file/browser'
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle,
  Database,
  Download,
  History,
  Pin,
  Pencil,
  Play,
  Save,
  Search,
  SlidersHorizontal,
  Star,
  Table,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { type DataPrepConfig, type RunLogEntry } from './data/preprocess'
import { profileRows, rowsFromSheet } from './data/tableUtils'
import { buildBaselinePublicationTable, buildCustomPublicationTable, publicationTableToRows, type CustomPublicationSource, type PublicationTable } from './export/publicationTables'
import type { ColumnType, Row, TypeOverrides } from './data/types'
import { getModelMaturity, getModelPlugin, getModelTaskGroup, getModelUseCase, modelPlugins, modelTaskGroupOrder } from './models/registry'
import type { InferenceConfig, ModelConfig, ModelParamValue, ModelPlugin, ModelResult, SpatialWeightsParam } from './models/types'
import { formatMetricValue, columnLabels, formatResultValue } from './components/results/resultFormat'
import { deriveResultInsights } from './components/results/resultInsights'
import { ResultReadingPanel } from './components/results'
import {
  allModelCategory,
  dataPreviewOverscanRows,
  dataPreviewRowHeight,
  dataPreviewVisibleRows,
  modelUsageStorageKey,
  snapshotStorageKey,
} from './constants/workbench'
import './App.css'

const noModelPlugin: ModelPlugin = {
  id: '',
  name: '尚未选择模型',
  nodeLabel: '尚未选择模型',
  panelLabel: 'No model selected',
  resultLabel: '结果',
  description: '请先从模型库选择并应用一个分析模型。',
  methodLabel: '',
  shortName: '',
  fullName: 'No model selected',
  category: '未选择',
  keywords: [],
  requiresTarget: false,
  targetLabel: '因变量 Y',
  featuresLabel: '自变量 X',
  downloadName: 'visual-stats-report.csv',
  supportsCategoricalFeatures: false,
  supportsInference: false,
  getDefaultConfig: () => ({ target: '', features: [], params: {} }),
  sanitizeConfig: () => ({ target: '', features: [], params: {} }),
  getFormula: () => '尚未完成变量设定',
  getSettings: () => [],
  fit: () => {
    throw new Error('请先选择模型。')
  },
  exportCsv: () => '',
}

const typeOptions: ColumnType[] = ['numeric', 'category', 'date', 'text', 'empty']

const previewValue = (value: Row[string]) => {
  if (value === null || value === undefined || value === '') return 'NA'
  return String(value)
}

const csvCell = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const csvLine = (values: Array<string | number | null | undefined>) => values.map(csvCell).join(',')

const escapeXml = (value: string | number) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

type WorkbenchSnapshot = {
  id: string
  createdAt: string
  updatedAt?: string
  label: string
  fileName: string
  rowCount: number
  fieldCount: number
  modelId: string
  modelName: string
  modelShortName?: string
  formula: string
  rows: Row[]
  dataRoles: DataRoles
  typeOverrides: TypeOverrides
  prepConfig: DataPrepConfig
  inferenceConfig: InferenceConfig
  modelConfig: ModelConfig
  result?: ModelResult
  resultLogs?: RunLogEntry[]
  savedResultAt?: string
  favorite?: boolean
  pinned?: boolean
  tags?: string[]
}

type RunState = {
  result: ModelResult | null
  error: string
  logs: RunLogEntry[]
  signature: string
}

type ValidationIssue = {
  level: 'error' | 'warning'
  message: string
}

type RunTaskStatus = 'preparing' | 'estimating' | 'finalizing' | 'completed' | 'cancelled' | 'failed'

type RunTask = {
  id: string
  modelName: string
  status: RunTaskStatus
  phase: string
  progress: number
  startedAt: number
  elapsedMs: number
  estimatedMs: number
}

type RunFailureDialog = {
  message: string
  modelName: string
  formula: string
}

type WorkspaceTab = 'workbench' | 'publication'

type ExportFormat = 'csv' | 'excel' | 'html' | 'word' | 'json'

type ExportItem = {
  id: string
  label: string
  detail: string
  kind: 'summary' | 'table' | 'report' | 'meta'
}

type CustomPublicationColumnDraft = {
  id: string
  label: string
  group: string
  modelLabel: string
}

type CustomPublicationFormatRules = {
  coefficientDigits: number
  statisticDigits: number
  nDigits: number
  r2Digits: number
  parenthesisMode: 't' | 'z' | 'stdError'
  starLevels: {
    one: number
    two: number
    three: number
  }
  missingDisplay: '' | '-' | '/'
  booleanDisplay: 'yes-no' | 'yes-blank' | 'check'
}

type CustomPublicationMode = 'current-three-line' | 'custom'

type CustomPublicationConfig = {
  mode: CustomPublicationMode
  title: string
  note: string
  selectedSourceIds: string[]
  columns: Record<string, CustomPublicationColumnDraft>
  columnOrder: string[]
  variableOrder: string[]
  variableLabels: Record<string, string>
  hiddenVariableIds: string[]
  statisticOrder: string[]
  statisticLabels: Record<string, string>
  disabledStatisticIds: string[]
  formatRules: CustomPublicationFormatRules
}

type CustomPublicationTemplate = {
  id: string
  name: string
  updatedAt: string
  config: CustomPublicationConfig
}

type CustomPublicationDragItem = {
  kind: 'column' | 'variable' | 'statistic'
  id: string
}

type WorkflowStep = 'model' | 'upload' | 'roles' | 'variables' | 'run' | 'results'
type SnapshotViewFilter = 'recent' | 'pinned' | 'favorite' | 'all'

const snapshotFilterOptions: Array<{ id: SnapshotViewFilter; label: string }> = [
  { id: 'recent', label: '最近' },
  { id: 'pinned', label: '置顶' },
  { id: 'favorite', label: '收藏' },
  { id: 'all', label: '全部' },
]

declare global {
  interface Window {
    visualStatsDesktop?: {
      platform: string
      versions: {
        electron: string
        chrome: string
      }
    }
  }
}

type ModelWorkerMessage =
  | {
      type: 'progress'
      taskId: string
      status: Extract<RunTaskStatus, 'preparing' | 'estimating' | 'finalizing'>
      phase: string
      progress: number
    }
  | {
      type: 'success'
      taskId: string
      result: ModelResult
      logs: RunLogEntry[]
    }
  | {
      type: 'error'
      taskId: string
      error: string
    }

type DataRoles = {
  idFields: string[]
  timeField: string
  groupFields: string[]
}

type PendingImport = {
  fileName: string
  rows: Row[]
  roles: DataRoles
}

type MissingValueAlert = {
  fileName: string
  rows: Row[]
  missingCells: number
  affectedRows: number
  fields: Array<{ name: string; missing: number }>
}

type PanelBalanceDiagnosis = {
  status: 'not-configured' | 'balanced' | 'unbalanced'
  title: string
  summary: string
  idCount: number
  timeCount: number
  expectedObservations: number
  actualObservations: number
  missingCombinations: number
  duplicateCombinations: number
  missingIdRows: number
  missingTimeRows: number
  examples: string[]
}

const emptyDataRoles: DataRoles = {
  idFields: [],
  timeField: '',
  groupFields: [],
}

const isMissingCell = (value: Row[string]) => value === null || value === undefined || value === ''

const summarizeMissingValues = (rows: Row[], fileName: string): MissingValueAlert | null => {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const fieldCounts = new Map<string, number>()
  let missingCells = 0
  let affectedRows = 0

  rows.forEach((row) => {
    let rowHasMissing = false

    fields.forEach((field) => {
      if (!isMissingCell(row[field])) return

      rowHasMissing = true
      missingCells += 1
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1)
    })

    if (rowHasMissing) affectedRows += 1
  })

  if (missingCells === 0) return null

  return {
    fileName,
    rows,
    missingCells,
    affectedRows,
    fields: [...fieldCounts.entries()]
      .map(([name, missing]) => ({ name, missing }))
      .sort((left, right) => right.missing - left.missing || left.name.localeCompare(right.name)),
  }
}

type ParameterField = NonNullable<ModelPlugin['parameterSchema']>[number]
type ParameterSectionId = 'fields' | 'estimation' | 'advanced'
type ModelUsageMap = Record<string, { usedCount: number; lastUsedAt: string }>

const parameterSectionMeta: Record<ParameterSectionId, { title: string; description: string }> = {
  fields: {
    title: '模型字段',
    description: '选择当前方法需要使用的数据列。',
  },
  estimation: {
    title: '估计设置',
    description: '控制检验值、迭代次数或 Bootstrap 等计算参数。',
  },
  advanced: {
    title: '高级选项',
    description: '设置权重、邻接关系或模型特有的扩展参数。',
  },
}

const advancedParameterIds = new Set(['neighborKey', 'weightField', 'spatialWeights'])
const slowModelIds = new Set(['mediation-analysis', 'moderated-mediation', 'reghdfe-regression', 'xtreg-fixed-effects'])

const getParameterSectionId = (field: ParameterField): ParameterSectionId => {
  if (field.kind === 'number') return 'estimation'
  if (field.kind === 'file') return 'advanced'
  if (advancedParameterIds.has(field.id)) return 'advanced'
  return 'fields'
}

const selectedParamValues = (config: ModelConfig, field: ParameterField) => {
  const value = config.params?.[field.id]
  if (field.kind === 'number') return []
  if (field.kind === 'file') return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return typeof value === 'string' && value ? [value] : []
}

const createEmptyModelConfig = (plugin: ModelPlugin | null): ModelConfig => {
  const params: Record<string, ModelParamValue> = {}

  plugin?.parameterSchema?.forEach((field) => {
    if (field.kind === 'number') {
      params[field.id] = field.defaultValue ?? 0
    } else if (field.kind === 'columns') {
      params[field.id] = []
    } else {
      params[field.id] = ''
    }
  })

  return { target: '', features: [], params }
}

const removeImplicitColumnDefaults = (
  plugin: ModelPlugin,
  sourceConfig: ModelConfig,
  sanitizedConfig: ModelConfig,
  featureColumns: string[],
  targetColumns: string[],
): ModelConfig => {
  if (!plugin.parameterSchema) {
    return {
      ...sanitizedConfig,
      target: sourceConfig.target ? sanitizedConfig.target : '',
      features: sourceConfig.features.length > 0 ? sanitizedConfig.features : [],
    }
  }

  const params: Record<string, ModelParamValue> = { ...(sanitizedConfig.params ?? {}) }

  plugin.parameterSchema.forEach((field) => {
    if (field.kind === 'number') return

    const sourceValue = sourceConfig.params?.[field.id]
    const allowedColumns = field.role === 'target' ? targetColumns : featureColumns

    if (field.kind === 'columns') {
      params[field.id] = Array.isArray(sourceValue) ? sourceValue.filter((value) => allowedColumns.includes(value)) : []
      return
    }

    if (field.kind === 'column') {
      params[field.id] = typeof sourceValue === 'string' && allowedColumns.includes(sourceValue) ? sourceValue : ''
      return
    }

    params[field.id] = sourceValue ?? ''
  })

  const target = typeof params.target === 'string' ? params.target : ''
  const explicitFeatureFields = new Set(
    plugin.parameterSchema
      .filter((field) => field.kind !== 'number' && field.kind !== 'file' && field.role === 'feature')
      .flatMap((field) => selectedParamValues({ ...sanitizedConfig, params }, field)),
  )
  const features = sanitizedConfig.features.filter((field) => explicitFeatureFields.has(field) && field !== target)

  return {
    ...sanitizedConfig,
    params,
    target,
    features,
  }
}

const estimateRunDuration = (modelId: string, rowCount: number) => {
  const rowFactor = Math.min(5000, rowCount) / 5000
  if (slowModelIds.has(modelId) || modelId.startsWith('spatial-')) return Math.round(4200 + rowFactor * 3600)
  if (rowCount > 5000) return 3000
  return 1800
}

const formatDuration = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
}

const customPublicationTemplateStorageKey = 'visual-stats-lab:custom-publication-templates'
const customPublicationDefaultTemplateStorageKey = 'visual-stats-lab:custom-publication-default-template'
const customPublicationDraftStorageKey = 'visual-stats-lab:custom-publication-draft'

const formatPublicationThreshold = (value: number) => {
  const normalized = Number(value.toFixed(3))
  return normalized.toString()
}

const parenthesisModeLabel = (mode: CustomPublicationFormatRules['parenthesisMode']) => {
  if (mode === 'stdError') return '标准误'
  if (mode === 'z') return 'z 值'
  return 't 值'
}

const buildCustomPublicationNote = (formatRules: CustomPublicationFormatRules) =>
  `注：稳健标准误；括号内为 ${parenthesisModeLabel(formatRules.parenthesisMode)}；* p<${formatPublicationThreshold(formatRules.starLevels.one)}，** p<${formatPublicationThreshold(
    formatRules.starLevels.two,
  )}，*** p<${formatPublicationThreshold(formatRules.starLevels.three)}。`

const defaultCustomPublicationFormatRules = (): CustomPublicationFormatRules => ({
  coefficientDigits: 4,
  statisticDigits: 2,
  nDigits: 0,
  r2Digits: 3,
  parenthesisMode: 't',
  starLevels: {
    one: 0.1,
    two: 0.05,
    three: 0.01,
  },
  missingDisplay: '',
  booleanDisplay: 'yes-no',
})

const defaultCustomPublicationConfig = (): CustomPublicationConfig => ({
  mode: 'current-three-line',
  title: '表 1：自定义回归结果',
  note: buildCustomPublicationNote(defaultCustomPublicationFormatRules()),
  selectedSourceIds: [],
  columns: {},
  columnOrder: [],
  variableOrder: [],
  variableLabels: {},
  hiddenVariableIds: [],
  statisticOrder: [],
  statisticLabels: {},
  disabledStatisticIds: [],
  formatRules: defaultCustomPublicationFormatRules(),
})

const normalizeCustomPublicationConfig = (candidate?: Partial<CustomPublicationConfig>): CustomPublicationConfig => {
  const base = defaultCustomPublicationConfig()
  return {
    ...base,
    ...candidate,
    mode: candidate?.mode === 'custom' ? 'custom' : 'current-three-line',
    columns: candidate?.columns ?? base.columns,
    columnOrder: candidate?.columnOrder ?? base.columnOrder,
    variableOrder: candidate?.variableOrder ?? base.variableOrder,
    variableLabels: candidate?.variableLabels ?? base.variableLabels,
    hiddenVariableIds: candidate?.hiddenVariableIds ?? base.hiddenVariableIds,
    statisticOrder: candidate?.statisticOrder ?? base.statisticOrder,
    statisticLabels: candidate?.statisticLabels ?? base.statisticLabels,
    disabledStatisticIds: candidate?.disabledStatisticIds ?? base.disabledStatisticIds,
    formatRules: {
      ...base.formatRules,
      ...(candidate?.formatRules ?? {}),
      starLevels: {
        ...base.formatRules.starLevels,
        ...(candidate?.formatRules?.starLevels ?? {}),
      },
    },
  }
}

const loadCustomPublicationTemplates = () => {
  try {
    const stored = window.localStorage.getItem(customPublicationTemplateStorageKey)
    return stored
      ? (JSON.parse(stored) as CustomPublicationTemplate[]).map((template) => ({
          ...template,
          config: normalizeCustomPublicationConfig(template.config),
        }))
      : []
  } catch {
    return []
  }
}

const loadCustomPublicationDefaultTemplateId = () => {
  try {
    return window.localStorage.getItem(customPublicationDefaultTemplateStorageKey) ?? ''
  } catch {
    return ''
  }
}

const loadCustomPublicationDraft = () => {
  try {
    const stored = window.localStorage.getItem(customPublicationDraftStorageKey)
    return stored ? normalizeCustomPublicationConfig(JSON.parse(stored) as Partial<CustomPublicationConfig>) : defaultCustomPublicationConfig()
  } catch {
    return defaultCustomPublicationConfig()
  }
}

const moveOrderedItem = (items: string[], id: string, toIndex: number) => {
  const index = items.indexOf(id)
  if (index === -1 || toIndex < 0 || toIndex >= items.length || index === toIndex) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(toIndex, 0, item)
  return next
}

const loadSnapshots = () => {
  try {
    const stored = window.localStorage.getItem(snapshotStorageKey)
    return stored ? (JSON.parse(stored) as WorkbenchSnapshot[]) : []
  } catch {
    return []
  }
}

const hasField = (roles: DataRoles, field: string) =>
  roles.idFields.includes(field) || roles.groupFields.includes(field) || roles.timeField === field

const fieldRoleLabel = (roles: DataRoles, field: string) => {
  if (roles.idFields.includes(field)) return 'ID'
  if (roles.timeField === field) return 'TIME'
  if (roles.groupFields.includes(field)) return 'GROUP'
  return ''
}

const fieldRoleValue = (roles: DataRoles, field: string) => {
  if (roles.idFields.includes(field)) return 'id'
  if (roles.timeField === field) return 'time'
  if (roles.groupFields.includes(field)) return 'group'
  return 'model'
}

const summarizeFields = (fields: string[]) => (fields.length > 0 ? fields.join(', ') : '未设置')

const withoutField = (fields: string[], field: string) => fields.filter((entry) => entry !== field)

const compactValue = (value: Row[string]) => (value === null || value === undefined || value === '' ? '' : String(value))

const createRunSignature = (payload: unknown) => JSON.stringify(payload)

const loadModelUsage = () => {
  try {
    const stored = window.localStorage.getItem(modelUsageStorageKey)
    return stored ? (JSON.parse(stored) as ModelUsageMap) : {}
  } catch {
    return {}
  }
}

const getCompositeId = (row: Row, idFields: string[]) => idFields.map((field) => compactValue(row[field])).join(' / ')

const asParamString = (value: ModelParamValue | undefined) => {
  if (Array.isArray(value)) return value[0] ?? ''
  if (value && typeof value === 'object') return ''
  return value === undefined ? '' : String(value)
}

const asParamArray = (value: ModelParamValue | undefined) => (Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [])

const asSpatialWeightsParam = (value: ModelParamValue | undefined): SpatialWeightsParam | null =>
  value && typeof value === 'object' && !Array.isArray(value) && value.kind === 'spatial-weights' ? value : null

const compactWeightCell = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim())

const parseDelimitedWeightLine = (line: string) => line.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean)

const parseGwtWeights = (text: string, fileName: string): SpatialWeightsParam | null => {
  const edges = text
    .split(/\r?\n/)
    .map((line) => parseDelimitedWeightLine(line))
    .flatMap((tokens) => {
      if (tokens.length < 3) return []
      const weight = Number(tokens[2])
      return Number.isFinite(weight) && weight !== 0 ? [{ from: tokens[0], to: tokens[1], weight }] : []
    })

  if (edges.length === 0) return null
  const nodeCount = new Set(edges.flatMap((edge) => [edge.from, edge.to])).size

  return {
    kind: 'spatial-weights',
    fileName,
    format: 'edge-list',
    edges,
    summary: `GWT · ${edges.length} 条边 · ${nodeCount} 个节点`,
  }
}

const parseGalWeights = (text: string, fileName: string): SpatialWeightsParam | null => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => parseDelimitedWeightLine(line))
    .filter((tokens) => tokens.length > 0)
  const edges: Array<{ from: string; to: string; weight: number }> = []
  let index = lines[0]?.length === 1 && Number.isFinite(Number(lines[0][0])) ? 1 : 0

  while (index < lines.length) {
    const header = lines[index]
    const from = header[0]
    const neighborCount = Number(header[1])
    if (!from || !Number.isFinite(neighborCount)) {
      index += 1
      continue
    }

    const neighbors = [...header.slice(2)]
    index += 1
    while (neighbors.length < neighborCount && index < lines.length) {
      neighbors.push(...lines[index])
      index += 1
    }

    neighbors.slice(0, neighborCount).forEach((to) => {
      if (to) edges.push({ from, to, weight: 1 })
    })
  }

  if (edges.length === 0) return null
  const nodeCount = new Set(edges.flatMap((edge) => [edge.from, edge.to])).size

  return {
    kind: 'spatial-weights',
    fileName,
    format: 'edge-list',
    edges,
    summary: `GAL · ${edges.length} 条邻接 · ${nodeCount} 个节点`,
  }
}

const parseSpatialWeightsText = (text: string, fileName: string): SpatialWeightsParam => {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'gwt') {
    const parsed = parseGwtWeights(text, fileName)
    if (parsed) return parsed
  }

  if (extension === 'gal') {
    const parsed = parseGalWeights(text, fileName)
    if (parsed) return parsed
  }

  const parsedWithHeader = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  })
  const headerRows = parsedWithHeader.data.filter((row) => Object.values(row).some((value) => compactWeightCell(value)))
  const headerFields = parsedWithHeader.meta.fields ?? []
  const normalizedFields = headerFields.reduce<Record<string, string>>((map, field) => {
    map[field.toLowerCase().trim()] = field
    return map
  }, {})
  const fromField = normalizedFields.from ?? normalizedFields.source ?? normalizedFields.origin ?? normalizedFields.i ?? normalizedFields.id ?? normalizedFields['起点'] ?? normalizedFields['来源'] ?? normalizedFields['源']
  const toField = normalizedFields.to ?? normalizedFields.target ?? normalizedFields.neighbor ?? normalizedFields.neighbour ?? normalizedFields.j ?? normalizedFields['终点'] ?? normalizedFields['目标'] ?? normalizedFields['邻居']
  const weightField = normalizedFields.weight ?? normalizedFields.w ?? normalizedFields.value ?? normalizedFields.weights ?? normalizedFields['权重'] ?? normalizedFields['值']

  if (fromField && toField) {
    const edges = headerRows.flatMap((row) => {
      const from = compactWeightCell(row[fromField])
      const to = compactWeightCell(row[toField])
      const weight = weightField ? Number(row[weightField]) : 1
      return from && to && Number.isFinite(weight) && weight !== 0 ? [{ from, to, weight }] : []
    })

    if (edges.length > 0) {
      const nodeCount = new Set(edges.flatMap((edge) => [edge.from, edge.to])).size
      return {
        kind: 'spatial-weights',
        fileName,
        format: 'edge-list',
        edges,
        summary: `${edges.length} 条边 · ${nodeCount} 个节点`,
      }
    }
  }

  const matrixRows = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  }).data.filter((row) => row.some((value) => compactWeightCell(value)))
  if (matrixRows.length < 2) throw new Error('空间权重文件至少需要 2 行。')

  const header = matrixRows[0].map(compactWeightCell)
  const nodes = header.slice(1)
  const matrix = matrixRows.slice(1).map((row) => row.slice(1).map((value) => Number(value)))
  const rowNodes = matrixRows.slice(1).map((row) => compactWeightCell(row[0]))

  if (nodes.length === 0 || matrix.length === 0 || matrix.some((row) => row.length !== nodes.length || row.some((value) => !Number.isFinite(value)))) {
    throw new Error('空间权重文件无法识别。请使用 from/to/weight 边表，或第一行/第一列为空间 ID 的方阵 CSV。')
  }

  return {
    kind: 'spatial-weights',
    fileName,
    format: 'matrix',
    nodes: rowNodes.every(Boolean) ? rowNodes : nodes,
    matrix,
    summary: `${matrix.length}x${nodes.length} 权重矩阵`,
  }
}

const getFeatureColumnsForPlugin = (plugin: ModelPlugin, profiles: ReturnType<typeof profileRows>, categoricalEncoding: DataPrepConfig['categoricalEncoding']) => {
  if (plugin.supportedFeatureTypes) {
    return profiles.filter((profile) => plugin.supportedFeatureTypes?.includes(profile.type)).map((profile) => profile.name)
  }

  const numericColumns = profiles.filter((profile) => profile.type === 'numeric').map((profile) => profile.name)
  const categoricalColumns = profiles.filter((profile) => profile.type === 'category').map((profile) => profile.name)

  return plugin.supportsCategoricalFeatures && categoricalEncoding === 'one-hot'
    ? [...numericColumns, ...categoricalColumns]
    : numericColumns
}

const diagnosePanelBalance = (rows: Row[], roles: DataRoles): PanelBalanceDiagnosis => {
  const emptyDiagnosis = {
    status: 'not-configured' as const,
    title: '未设置面板维度',
    summary: '设置 ID 和 Time 字段后，系统会判断数据是否为平衡面板。',
    idCount: 0,
    timeCount: 0,
    expectedObservations: 0,
    actualObservations: rows.length,
    missingCombinations: 0,
    duplicateCombinations: 0,
    missingIdRows: 0,
    missingTimeRows: 0,
    examples: [],
  }

  if (rows.length === 0 || roles.idFields.length === 0 || !roles.timeField) return emptyDiagnosis

  const validRows = rows.filter((row) => roles.idFields.every((field) => compactValue(row[field])) && compactValue(row[roles.timeField]))
  const missingIdRows = rows.length - rows.filter((row) => roles.idFields.every((field) => compactValue(row[field]))).length
  const missingTimeRows = rows.length - rows.filter((row) => compactValue(row[roles.timeField])).length
  const ids = Array.from(new Set(validRows.map((row) => getCompositeId(row, roles.idFields)))).sort()
  const times = Array.from(new Set(validRows.map((row) => compactValue(row[roles.timeField])))).sort()
  const counts = new Map<string, number>()

  validRows.forEach((row) => {
    const key = `${getCompositeId(row, roles.idFields)}\u0000${compactValue(row[roles.timeField])}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const missingExamples: string[] = []
  let missingCombinations = 0
  ids.forEach((id) => {
    const missingTimes = times.filter((time) => !counts.has(`${id}\u0000${time}`))
    missingCombinations += missingTimes.length
    if (missingTimes.length > 0 && missingExamples.length < 4) {
      missingExamples.push(`${id} 缺少 ${missingTimes.slice(0, 4).join(', ')}${missingTimes.length > 4 ? ' 等时间点' : ''}`)
    }
  })

  const duplicateExamples: string[] = []
  let duplicateCombinations = 0
  counts.forEach((count, key) => {
    if (count <= 1) return
    duplicateCombinations += count - 1
    if (duplicateExamples.length < 3) {
      const [id, time] = key.split('\u0000')
      duplicateExamples.push(`${id} 在 ${time} 有 ${count} 条记录`)
    }
  })

  const issueExamples = [
    ...(missingIdRows > 0 ? [`${missingIdRows} 行缺少 ID 字段`] : []),
    ...(missingTimeRows > 0 ? [`${missingTimeRows} 行缺少 Time 字段`] : []),
    ...missingExamples,
    ...duplicateExamples,
  ].slice(0, 6)
  const expectedObservations = ids.length * times.length
  const status = missingCombinations === 0 && duplicateCombinations === 0 && missingIdRows === 0 && missingTimeRows === 0 ? 'balanced' : 'unbalanced'

  return {
    status,
    title: status === 'balanced' ? '平衡面板' : '不平衡面板',
    summary:
      status === 'balanced'
        ? '每个 ID 都覆盖相同 Time 集合，且没有重复 ID-Time 组合。'
        : '存在缺失 ID-Time 组合、重复组合，或维度字段缺失。',
    idCount: ids.length,
    timeCount: times.length,
    expectedObservations,
    actualObservations: validRows.length,
    missingCombinations,
    duplicateCombinations,
    missingIdRows,
    missingTimeRows,
    examples: issueExamples,
  }
}

const inferDataRoles = (rows: Row[]): DataRoles => {
  const columns = Object.keys(rows[0] ?? {})
  const lower = (column: string) => column.toLowerCase()
  const idFields = columns.filter((column) => /(^id$|_id$|^id_|编号|代码|code$)/i.test(column)).slice(0, 2)
  const timeField =
    columns.find((column) => /(^year$|年份|年度)/i.test(column)) ??
    columns.find((column) => /(^date$|日期|time|month|月份|季度|quarter)/i.test(lower(column))) ??
    ''
  const groupFields = columns
    .filter((column) => !idFields.includes(column) && column !== timeField)
    .filter((column) => /(group|category|region|industry|segment|类别|分组|地区|行业)/i.test(column))
    .slice(0, 2)

  return { idFields, timeField, groupFields }
}

function App() {
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [typeOverrides, setTypeOverrides] = useState<TypeOverrides>({})
  const [prepConfig, setPrepConfig] = useState<DataPrepConfig>({
    missingStrategy: 'drop',
    categoricalEncoding: 'one-hot',
  })
  const [inferenceConfig, setInferenceConfig] = useState<InferenceConfig>({
    standardError: 'ols',
    clusterField: '',
  })
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const [draftModelId, setDraftModelId] = useState<string | null>(null)
  const [isDataModalOpen, setIsDataModalOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [missingValueAlert, setMissingValueAlert] = useState<MissingValueAlert | null>(null)
  const [dataRoles, setDataRoles] = useState<DataRoles>(emptyDataRoles)
  const [isModelLibraryOpen, setIsModelLibraryOpen] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [selectedModelCategory, setSelectedModelCategory] = useState(allModelCategory)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')
  const [selectedExportItemIds, setSelectedExportItemIds] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [customPublicationConfig, setCustomPublicationConfig] = useState<CustomPublicationConfig>(loadCustomPublicationDraft)
  const [customPublicationTemplates, setCustomPublicationTemplates] = useState<CustomPublicationTemplate[]>(loadCustomPublicationTemplates)
  const [customPublicationDefaultTemplateId, setCustomPublicationDefaultTemplateId] = useState(loadCustomPublicationDefaultTemplateId)
  const [draggingPublicationItem, setDraggingPublicationItem] = useState<CustomPublicationDragItem | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('workbench')
  const [snapshotViewFilter, setSnapshotViewFilter] = useState<SnapshotViewFilter>('recent')
  const [modelUsage, setModelUsage] = useState<ModelUsageMap>(loadModelUsage)
  const [snapshots, setSnapshots] = useState<WorkbenchSnapshot[]>(loadSnapshots)
  const [renamingSnapshotId, setRenamingSnapshotId] = useState('')
  const [snapshotNameDraft, setSnapshotNameDraft] = useState('')
  const [selectedSnapshotIds, setSelectedSnapshotIds] = useState<string[]>([])
  const [isSnapshotManageMode, setIsSnapshotManageMode] = useState(false)
  const [runState, setRunState] = useState<RunState>({
    result: null,
    error: '',
    logs: [{ level: 'info', message: '导入数据并点击运行模型后，这里会显示结果。' }],
    signature: '',
  })
  const [isModelRunning, setIsModelRunning] = useState(false)
  const [runStatus, setRunStatus] = useState('')
  const [runTask, setRunTask] = useState<RunTask | null>(null)
  const [runFailureDialog, setRunFailureDialog] = useState<RunFailureDialog | null>(null)
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('model')
  const [isVariableSetupOpen, setIsVariableSetupOpen] = useState(false)
  const [dataPreviewScrollTop, setDataPreviewScrollTop] = useState(0)
  const runCancelRef = useRef(false)
  const runWorkerRef = useRef<Worker | null>(null)
  const hasActiveModel = Boolean(activeModelId)
  const activeModel = activeModelId ? getModelPlugin(activeModelId) : noModelPlugin
  const draftModel = draftModelId ? getModelPlugin(draftModelId) : null
  const modelMaturity = getModelMaturity(activeModel)
  const canImportData = hasActiveModel && !isModelRunning
  const hasDataset = rows.length > 0
  const profiles = useMemo(() => profileRows(rows, typeOverrides), [rows, typeOverrides])
  const previewColumns = useMemo(() => Object.keys(rows[0] ?? {}), [rows])
  const virtualPreviewStart = Math.max(0, Math.floor(dataPreviewScrollTop / dataPreviewRowHeight) - dataPreviewOverscanRows)
  const virtualPreviewEnd = Math.min(rows.length, virtualPreviewStart + dataPreviewVisibleRows + dataPreviewOverscanRows * 2)
  const virtualPreviewRows = useMemo(() => rows.slice(virtualPreviewStart, virtualPreviewEnd), [rows, virtualPreviewEnd, virtualPreviewStart])
  const pendingColumns = useMemo(() => Object.keys(pendingImport?.rows[0] ?? {}), [pendingImport])
  const pendingProfiles = useMemo(() => (pendingImport ? profileRows(pendingImport.rows) : []), [pendingImport])
  const pendingPreviewRows = useMemo(() => pendingImport?.rows.slice(0, 6) ?? [], [pendingImport])
  const dimensionColumns = useMemo(() => new Set([...dataRoles.idFields, dataRoles.timeField, ...dataRoles.groupFields].filter(Boolean)), [dataRoles])
  const modelProfiles = useMemo(() => profiles.filter((profile) => !dimensionColumns.has(profile.name)), [dimensionColumns, profiles])
  const featureProfiles = activeModel.includeDimensionFields ? profiles : modelProfiles
  const numericColumns = useMemo(
    () => modelProfiles.filter((profile) => profile.type === 'numeric').map((profile) => profile.name),
    [modelProfiles],
  )
  const eligibleFeatureColumns = useMemo(
    () => (hasActiveModel ? getFeatureColumnsForPlugin(activeModel, featureProfiles, prepConfig.categoricalEncoding) : []),
    [activeModel, featureProfiles, hasActiveModel, prepConfig.categoricalEncoding],
  )
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => createEmptyModelConfig(activeModel))

  useEffect(() => {
    if (!isModelRunning) return undefined

    const intervalId = window.setInterval(() => {
      setRunTask((current) => {
        if (!current || current.status === 'cancelled') return current
        const elapsedMs = Date.now() - current.startedAt
        const estimatedProgress = Math.min(92, Math.round((elapsedMs / current.estimatedMs) * 86) + 6)
        return {
          ...current,
          elapsedMs,
          progress: Math.max(current.progress, estimatedProgress),
        }
      })
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [isModelRunning])

  useEffect(
    () => () => {
      runCancelRef.current = true
      runWorkerRef.current?.terminate()
    },
    [],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(modelUsageStorageKey, JSON.stringify(modelUsage))
    } catch {
      // Usage ranking is best-effort and should not block analysis.
    }
  }, [modelUsage])

  useEffect(() => {
    try {
      window.localStorage.setItem(customPublicationTemplateStorageKey, JSON.stringify(customPublicationTemplates))
    } catch {
      // Template persistence is best-effort and should not block export.
    }
  }, [customPublicationTemplates])

  useEffect(() => {
    try {
      window.localStorage.setItem(customPublicationDefaultTemplateStorageKey, customPublicationDefaultTemplateId)
    } catch {
      // Default template persistence is best-effort.
    }
  }, [customPublicationDefaultTemplateId])

  useEffect(() => {
    try {
      window.localStorage.setItem(customPublicationDraftStorageKey, JSON.stringify(customPublicationConfig))
    } catch {
      // Draft persistence is best-effort and should not block export.
    }
  }, [customPublicationConfig])

  const sanitizedConfig = useMemo(
    () =>
      hasActiveModel
        ? removeImplicitColumnDefaults(
            activeModel,
            modelConfig,
            activeModel.sanitizeConfig(modelConfig, eligibleFeatureColumns, numericColumns),
            eligibleFeatureColumns,
            numericColumns,
          )
        : createEmptyModelConfig(null),
    [activeModel, eligibleFeatureColumns, hasActiveModel, modelConfig, numericColumns],
  )
  const selectedTarget = sanitizedConfig.target
  const selectedFeatures = sanitizedConfig.features
  const schemaColumnsByType = useMemo(
    () =>
      profiles.reduce<Record<string, string[]>>((groups, profile) => {
        groups[profile.type] = [...(groups[profile.type] ?? []), profile.name]
        return groups
      }, {}),
    [profiles],
  )
  const selectableFeatureColumns = useMemo(
    () => eligibleFeatureColumns.filter((column) => !activeModel.requiresTarget || column !== selectedTarget),
    [activeModel.requiresTarget, eligibleFeatureColumns, selectedTarget],
  )
  const panelDiagnosis = useMemo(() => diagnosePanelBalance(rows, dataRoles), [dataRoles, rows])
  const clusterColumns = useMemo(() => {
    const preferred = [...dataRoles.idFields, dataRoles.timeField, ...dataRoles.groupFields].filter(Boolean)
    return Array.from(new Set([...preferred, ...previewColumns]))
  }, [dataRoles, previewColumns])
  const effectiveInference = useMemo(
    () => ({
      ...inferenceConfig,
      clusterField: inferenceConfig.clusterField || clusterColumns[0] || '',
    }),
    [clusterColumns, inferenceConfig],
  )
  const currentRunSignature = useMemo(
    () =>
      createRunSignature({
        modelId: activeModelId,
        fileName,
        rowCount: rows.length,
        fields: profiles.map((profile) => [profile.name, profile.type, profile.missing, profile.unique]),
        dataRoles,
        prepConfig,
        inference: hasActiveModel && activeModel.supportsInference ? effectiveInference : undefined,
        config: sanitizedConfig,
      }),
    [activeModel, activeModelId, dataRoles, effectiveInference, fileName, hasActiveModel, prepConfig, profiles, rows.length, sanitizedConfig],
  )
  const hasStaleResult = Boolean(runState.result && runState.signature !== currentRunSignature)
  const result = hasStaleResult ? null : runState.result
  const modelError = runState.signature === currentRunSignature ? runState.error : ''
  const mainResultTable = useMemo(() => result?.tables.find((table) => table.id === 'coefficients') ?? result?.tables[0] ?? null, [result])
  const secondaryResultTables = useMemo(
    () => result?.tables.filter((table) => table.id !== mainResultTable?.id) ?? [],
    [mainResultTable?.id, result],
  )
  const runLogs = useMemo(
    () => {
      if (isModelRunning) {
        return [
          { level: 'info', message: runTask?.phase || runStatus || '正在运行模型。' },
          { level: 'info', message: `任务已运行 ${formatDuration(runTask?.elapsedMs ?? 0)}，预计 ${formatDuration(runTask?.estimatedMs ?? 0)} 内完成。` },
          { level: 'info', message: '运行期间参数面板已锁定，可以点击取消终止尚未进入计算核心的任务。' },
        ] satisfies RunLogEntry[]
      }

      if (!hasDataset) return [{ level: 'info', message: '请先导入 CSV 或 XLSX 数据。' } satisfies RunLogEntry]

      if (runTask?.status === 'cancelled' && runState.signature === currentRunSignature) return runState.logs

      if (result || modelError) return runState.logs

      if (hasStaleResult) {
        return [
          { level: 'warning', message: '模型、参数或数据已变更，当前结果已过期。请点击运行模型更新。' } satisfies RunLogEntry,
          ...runState.logs,
        ]
      }

      return [{ level: 'info', message: '参数设置完成后，点击运行模型开始计算。' } satisfies RunLogEntry]
    },
	    [currentRunSignature, hasDataset, hasStaleResult, isModelRunning, modelError, result, runState.logs, runState.signature, runStatus, runTask],
	  )
  const publicationSources = useMemo(() => {
    const currentSource =
      result && hasActiveModel
        ? [
            {
              id: 'current',
              label: `当前结果 · ${activeModel.name}`,
              result,
              config: sanitizedConfig,
              dimensions: dataRoles,
              modelName: activeModel.name,
              modelShortName: activeModel.shortName || activeModel.name,
              formula: activeModel.getFormula(sanitizedConfig),
              createdAt: new Date().toISOString(),
            },
          ]
        : []
    const snapshotSources = snapshots
      .filter((snapshot) => snapshot.result)
      .map((snapshot) => ({
        id: `snapshot:${snapshot.id}`,
        label: snapshot.label,
        result: snapshot.result as ModelResult,
        config: snapshot.modelConfig,
        dimensions: snapshot.dataRoles ?? emptyDataRoles,
        modelName: snapshot.modelName,
        modelShortName: snapshot.modelShortName || getModelPlugin(snapshot.modelId).shortName || snapshot.modelName,
        formula: snapshot.formula,
        createdAt: snapshot.savedResultAt ?? snapshot.createdAt,
      }))

    return [...currentSource, ...snapshotSources]
  }, [activeModel, dataRoles, hasActiveModel, result, sanitizedConfig, snapshots])
  const hasPublicationSources = publicationSources.some((source) => source.result.tables.some((table) => table.id === 'coefficients'))
  const exportItems = useMemo<ExportItem[]>(() => {
    if (!result) return []
    const hasCoefficientTable = result.tables.some((table) => table.id === 'coefficients')

    return [
      { id: 'summary', label: '模型摘要', detail: `${result.summary.length} 个指标`, kind: 'summary' },
      ...result.tables.map((table) => ({
        id: `table:${table.id}`,
        label: table.id === 'coefficients' ? '回归结果' : table.title,
        detail: `${table.rows.length} 行 · ${table.columns.length} 列`,
        kind: 'table' as const,
      })),
      ...(hasCoefficientTable
        ? [
            { id: 'stata', label: 'Stata 风格回归表', detail: 'Coef. / Std. err. / P>|t|', kind: 'report' as const },
            { id: 'three-line', label: '论文三线表', detail: '系数星号与标准误', kind: 'report' as const },
            ...(hasPublicationSources
              ? [{ id: 'custom-publication', label: '自定义论文表', detail: `${publicationSources.length} 个可用结果源`, kind: 'report' as const }]
              : []),
          ]
        : []),
      { id: 'logs', label: '模型运行日志', detail: `${runLogs.length} 条日志`, kind: 'meta' },
      { id: 'config', label: '参数配置 JSON', detail: '模型、字段、参数快照', kind: 'meta' },
    ]
  }, [hasPublicationSources, publicationSources.length, result, runLogs.length])
  const selectedExportItemSet = useMemo(() => new Set(selectedExportItemIds), [selectedExportItemIds])
  const hasCurrentPublicationSource = publicationSources.some((source) => source.id === 'current')
  const defaultCustomPublicationSourceIds = useMemo(() => (hasCurrentPublicationSource ? ['current'] : []), [hasCurrentPublicationSource])
  const effectiveCustomPublicationSourceIds = useMemo(
    () => (customPublicationConfig.selectedSourceIds.length > 0 ? customPublicationConfig.selectedSourceIds : defaultCustomPublicationSourceIds),
    [customPublicationConfig.selectedSourceIds, defaultCustomPublicationSourceIds],
  )
  const customPublicationSelectedSet = useMemo(() => new Set(effectiveCustomPublicationSourceIds), [effectiveCustomPublicationSourceIds])
  const selectedPublicationSources = useMemo(
    () => {
      const selected = publicationSources.filter((source) => customPublicationSelectedSet.has(source.id))
      const byId = new Map(selected.map((source) => [source.id, source]))
      const ordered: CustomPublicationSource[] = []
      customPublicationConfig.columnOrder.forEach((id) => {
        const source = byId.get(id)
        if (source) {
          ordered.push(source)
          byId.delete(id)
        }
      })
      byId.forEach((source) => ordered.push(source))
      return ordered
    },
    [customPublicationConfig.columnOrder, customPublicationSelectedSet, publicationSources],
  )
  const customPublicationVariableOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string }>()
    selectedPublicationSources.forEach((source) => {
      const coefficientTable = source.result.tables.find((table) => table.id === 'coefficients')
      coefficientTable?.rows.forEach((row) => {
        const rawId = String(row.term ?? row.variable ?? '').trim()
        if (!rawId) return
        const label = customPublicationConfig.variableLabels[rawId]?.trim() || (rawId === '_cons' ? 'Cons' : rawId)
        if (!byId.has(rawId)) byId.set(rawId, { id: rawId, label })
      })
    })
    return Array.from(byId.values())
  }, [customPublicationConfig.variableLabels, selectedPublicationSources])
  const orderedCustomPublicationVariableOptions = useMemo(() => {
    const optionMap = new Map(customPublicationVariableOptions.map((option) => [option.id, option]))
    const ordered: Array<{ id: string; label: string }> = []
    customPublicationConfig.variableOrder.forEach((id) => {
      const option = optionMap.get(id)
      if (option) {
        ordered.push(option)
        optionMap.delete(id)
      }
    })
    optionMap.forEach((option) => ordered.push(option))
    return ordered
  }, [customPublicationConfig.variableOrder, customPublicationVariableOptions])
  const hiddenCustomPublicationVariableSet = useMemo(() => new Set(customPublicationConfig.hiddenVariableIds), [customPublicationConfig.hiddenVariableIds])
  const customPublicationStatisticOptions = useMemo(() => {
    const rows: Array<{ id: string; label: string; detail: string }> = []
    if (selectedPublicationSources.length === 0) return rows

    rows.push({
      id: 'controls',
      label: customPublicationConfig.statisticLabels.controls?.trim() || 'Controls',
      detail: '控制变量行，按模型列展示 Yes / 空值',
    })

    const fixedEffectLabels = new Set<string>()
    selectedPublicationSources.forEach((source) => {
      source.dimensions.groupFields.forEach((field) => fixedEffectLabels.add(`${field} FE`))
      source.dimensions.idFields.forEach((field) => fixedEffectLabels.add(`${field} FE`))
      if (source.dimensions.timeField) fixedEffectLabels.add(`${source.dimensions.timeField} FE`)
    })
    Array.from(fixedEffectLabels).forEach((label) => {
      rows.push({
        id: `fe:${label}`,
        label: customPublicationConfig.statisticLabels[`fe:${label}`]?.trim() || label,
        detail: '固定效应统计行',
      })
    })

    rows.push(
      { id: 'n', label: customPublicationConfig.statisticLabels.n?.trim() || 'N', detail: '样本量统计行' },
      { id: 'adj-r2', label: customPublicationConfig.statisticLabels['adj-r2']?.trim() || 'Adj-R²', detail: '调整 R² 统计行' },
    )

    const byId = new Map(rows.map((row) => [row.id, row]))
    const ordered: typeof rows = []
    customPublicationConfig.statisticOrder.forEach((id) => {
      const row = byId.get(id)
      if (row) {
        ordered.push(row)
        byId.delete(id)
      }
    })
    byId.forEach((row) => ordered.push(row))

    return ordered
  }, [customPublicationConfig.statisticLabels, customPublicationConfig.statisticOrder, selectedPublicationSources])
  const disabledCustomPublicationStatisticSet = useMemo(() => new Set(customPublicationConfig.disabledStatisticIds), [customPublicationConfig.disabledStatisticIds])
  const customPublicationEnabled = selectedExportItemSet.has('custom-publication')
  const isCustomPublicationDefaultTableMode = customPublicationConfig.mode === 'current-three-line' && Boolean(result && hasActiveModel)
  const customPublicationPreviewTable = hasPublicationSources ? buildCustomPublicationTableFromConfig() : null
  const customPublicationPreviewHtml = customPublicationPreviewTable ? buildPublicationTableHtml(customPublicationPreviewTable) : ''
  const canExportCustomPublication = Boolean(customPublicationPreviewTable) && !isExporting
  const matchedCustomPublicationTemplate = useMemo(() => {
    const currentSignature = JSON.stringify(customPublicationConfig)
    return customPublicationTemplates.find((template) => JSON.stringify(template.config) === currentSignature) ?? null
  }, [customPublicationConfig, customPublicationTemplates])
  const modelOrder = useMemo(() => new Map(modelPlugins.map((plugin, index) => [plugin.id, index])), [])
  const modelCategories = useMemo(
    () => [allModelCategory, ...modelTaskGroupOrder.filter((category) => modelPlugins.some((plugin) => getModelTaskGroup(plugin) === category))],
    [],
  )
  const filteredModelPlugins = useMemo(() => {
    const query = modelSearch.trim().toLowerCase()
    const categoryFiltered =
      selectedModelCategory === allModelCategory
        ? modelPlugins
        : modelPlugins.filter((plugin) => getModelTaskGroup(plugin) === selectedModelCategory)
    const matched = query
      ? categoryFiltered.filter((plugin) =>
          [plugin.name, plugin.shortName, plugin.fullName, getModelTaskGroup(plugin), plugin.description, ...plugin.keywords]
            .join(' ')
            .toLowerCase()
            .includes(query),
        )
      : categoryFiltered

    return [...matched].sort((left, right) => {
      if (activeModelId && left.id === activeModelId) return -1
      if (activeModelId && right.id === activeModelId) return 1
      const leftUsage = modelUsage[left.id]
      const rightUsage = modelUsage[right.id]
      const lastUsedDelta = new Date(rightUsage?.lastUsedAt ?? 0).getTime() - new Date(leftUsage?.lastUsedAt ?? 0).getTime()
      if (lastUsedDelta !== 0) return lastUsedDelta
      const countDelta = (rightUsage?.usedCount ?? 0) - (leftUsage?.usedCount ?? 0)
      if (countDelta !== 0) return countDelta
      return (modelOrder.get(left.id) ?? 0) - (modelOrder.get(right.id) ?? 0)
    })
  }, [activeModelId, modelOrder, modelSearch, modelUsage, selectedModelCategory])
  const recentModelPlugins = useMemo(
    () =>
      modelPlugins
        .filter((plugin) => plugin.id !== activeModelId && modelUsage[plugin.id]?.lastUsedAt)
        .sort((left, right) => new Date(modelUsage[right.id]?.lastUsedAt ?? 0).getTime() - new Date(modelUsage[left.id]?.lastUsedAt ?? 0).getTime())
        .slice(0, 5),
    [activeModelId, modelUsage],
  )
  const parameterSections = useMemo(() => {
    const schema = activeModel.parameterSchema ?? []
    return (Object.keys(parameterSectionMeta) as ParameterSectionId[])
      .map((sectionId) => ({
        id: sectionId,
        ...parameterSectionMeta[sectionId],
        fields: schema.filter((field) => getParameterSectionId(field) === sectionId),
      }))
      .filter((section) => section.fields.length > 0)
  }, [activeModel.parameterSchema])
  const validationIssues = useMemo(() => {
    const issues: ValidationIssue[] = []

    if (!hasDataset) return issues
    if (!hasActiveModel) {
      issues.push({ level: 'error', message: '请先选择一个分析模型。' })
      return issues
    }

    if (activeModel.parameterSchema) {
      activeModel.parameterSchema.forEach((field) => {
        if (!field.required) return
        const values = selectedParamValues(sanitizedConfig, field)
        if (field.kind !== 'number' && values.length === 0) {
          issues.push({ level: 'error', message: `请设置「${field.label}」。` })
        }
      })

      const selectedFields = activeModel.parameterSchema.flatMap((field) => selectedParamValues(sanitizedConfig, field))
      const duplicatedFields = Array.from(new Set(selectedFields.filter((field, index) => selectedFields.indexOf(field) !== index)))
      duplicatedFields.forEach((field) => {
        issues.push({ level: 'warning', message: `字段「${field}」被重复选择，请确认是否符合模型设定。` })
      })
    } else {
      if (activeModel.requiresTarget && !selectedTarget) {
        issues.push({ level: 'error', message: `请设置「${activeModel.targetLabel}」。` })
      }

      if (activeModel.requiresTarget && selectedFeatures.length === 0) {
        issues.push({ level: 'error', message: `请至少选择一个「${activeModel.featuresLabel}」。` })
      }

      if (!activeModel.requiresTarget && selectedFeatures.length === 0) {
        issues.push({ level: 'error', message: `请至少选择一个「${activeModel.featuresLabel}」。` })
      }
    }

    const groupField = typeof sanitizedConfig.params?.group === 'string' ? sanitizedConfig.params.group : ''
    if (groupField) {
      const groups = new Set(rows.map((row) => previewValue(row[groupField])).filter((value) => value !== 'NA'))
      if (['independent-t-test', 'nonparametric-test', 'category-summary', 'variance-analysis'].includes(activeModel.id) && groups.size < 2) {
        issues.push({ level: 'error', message: `分组变量「${groupField}」至少需要 2 个有效组。` })
      }

      if (activeModel.id === 'independent-t-test' && groups.size > 2) {
        issues.push({ level: 'warning', message: `独立 t 检验当前会自动取样本量最大的两个组，其他组不会参与比较。` })
      }
    }

    if (activeModel.id === 'crosstab-chi-square') {
      const rowVar = sanitizedConfig.params?.rowVar
      const colVar = sanitizedConfig.params?.colVar
      if (rowVar && colVar && rowVar === colVar) {
        issues.push({ level: 'error', message: '交叉/卡方的行变量和列变量不能相同。' })
      }
    }

    if (activeModel.supportsInference && inferenceConfig.standardError === 'cluster' && !effectiveInference.clusterField) {
      issues.push({ level: 'error', message: 'Cluster 标准误需要选择聚类字段。' })
    }

    if (slowModelIds.has(activeModel.id) || activeModel.id.startsWith('spatial-')) {
      issues.push({ level: 'warning', message: `${activeModel.name}属于较慢模型，建议先用小字段集确认设定后再完整运行。` })
    }

    if (rows.length > 5000 && (slowModelIds.has(activeModel.id) || activeModel.id.startsWith('spatial-'))) {
      issues.push({ level: 'warning', message: '当前数据量较大，运行可能需要更长时间。' })
    }

    return issues
  }, [activeModel, effectiveInference.clusterField, hasActiveModel, hasDataset, inferenceConfig.standardError, rows, sanitizedConfig, selectedFeatures.length, selectedTarget])
  const validationErrors = validationIssues.filter((issue) => issue.level === 'error')
  const resultInsights = useMemo(() => deriveResultInsights(result), [result])
  const hasRoleSetting = dataRoles.idFields.length > 0 || Boolean(dataRoles.timeField) || dataRoles.groupFields.length > 0
  const effectiveWorkflowStep = useMemo<WorkflowStep>(() => {
    if (isModelRunning) return 'run'
    if (!hasActiveModel) return 'model'
    if (modelError) return 'variables'
    if (result && !hasStaleResult) return 'results'
    if (result && hasStaleResult && workflowStep === 'results') return 'variables'
    if (!hasDataset && workflowStep !== 'model') return 'upload'
    if (workflowStep === 'run') return 'variables'
    return workflowStep
  }, [hasActiveModel, hasDataset, hasStaleResult, isModelRunning, modelError, result, workflowStep])
  const nextAction = useMemo(() => {
    if (effectiveWorkflowStep === 'model') return hasActiveModel ? '已选择模型，可以继续导入数据。' : '请先选择一个分析模型。'
    if (effectiveWorkflowStep === 'upload') return '下一步：导入 CSV 或 XLSX 数据。'
    if (effectiveWorkflowStep === 'roles') return '下一步：设置 ID / Time / Group 字段。'
    if (effectiveWorkflowStep === 'variables') return '下一步：选择因变量、自变量和控制变量。'
    if (effectiveWorkflowStep === 'run') return runTask?.phase || '模型正在运行，参数已临时锁定。'
    if (validationErrors.length > 0) return `请先处理：${validationErrors[0].message}`
    if (hasStaleResult) return '参数已经变更，建议重新运行模型刷新结果。'
    if (!result) return '参数已就绪，可以运行模型。'
    return '结果已生成，按系数估计、核心结论和稳定性检验顺序阅读。'
  }, [effectiveWorkflowStep, hasActiveModel, hasStaleResult, result, runTask?.phase, validationErrors])
  const workspaceMode = useMemo<'data' | 'model' | 'result' | 'report' | 'publication'>(() => {
    if (workspaceTab === 'publication') return 'publication'
    if (isExportModalOpen) return 'report'
    if (effectiveWorkflowStep === 'results') return 'result'
    if (effectiveWorkflowStep === 'upload' || effectiveWorkflowStep === 'roles') return 'data'
    return 'model'
  }, [effectiveWorkflowStep, isExportModalOpen, workspaceTab])
  const leadInsight = resultInsights[0] ?? ''
  const secondaryInsights = resultInsights.slice(1)
  const visibleSummaryMetrics = result?.summary.slice(0, 4) ?? []
  const hasCancelledRunTask = runTask?.status === 'cancelled' && runState.signature === currentRunSignature
  const shouldShowFocusTask = workspaceMode !== 'result' && (isModelRunning || hasStaleResult || hasCancelledRunTask)
  const roleSummary = [
    dataRoles.idFields.length > 0 ? `ID ${summarizeFields(dataRoles.idFields)}` : '',
    dataRoles.timeField ? `Time ${dataRoles.timeField}` : '',
    dataRoles.groupFields.length > 0 ? `Group ${summarizeFields(dataRoles.groupFields)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const activeFormula =
    !hasActiveModel
      ? '尚未选择模型'
      : !hasDataset || validationErrors.length > 0
        ? '尚未完成变量设定'
        : activeModel.getFormula(sanitizedConfig)
  const selectedFeatureSummary =
    selectedFeatures.length === 0
      ? '尚未选择解释变量'
      : selectedFeatures.length <= 3
        ? selectedFeatures.join('、')
        : `${selectedFeatures.slice(0, 3).join('、')} 等 ${selectedFeatures.length} 个变量`
  const modelContextLead =
    !isModelRunning && modelError
      ? `模型运行失败，请调整变量后重试：${modelError}`
      : validationErrors.length > 0
      ? validationErrors[0].message
      : activeModel.requiresTarget
        ? `${activeModel.targetLabel}已选为 ${selectedTarget || '未设置'}，${activeModel.featuresLabel}当前为 ${selectedFeatureSummary}。`
        : `${activeModel.featuresLabel}当前为 ${selectedFeatureSummary}。`
  const workspaceHeading =
    workspaceMode === 'publication'
      ? '编辑论文表'
      : workspaceMode === 'report'
        ? '整理并导出结果'
        : effectiveWorkflowStep === 'model'
          ? '选择分析模型'
          : effectiveWorkflowStep === 'upload'
            ? '导入分析数据'
            : effectiveWorkflowStep === 'roles'
              ? '设置 ID 与分组字段'
              : effectiveWorkflowStep === 'variables'
                ? '选择变量与控制项'
                : effectiveWorkflowStep === 'run'
                  ? '运行模型'
                  : '阅读并解释结果'
  const workspaceLead =
    workspaceMode === 'publication'
      ? '把来源列、变量行、统计行和注释整理成一张适合导出的论文表。'
      : workspaceMode === 'report'
        ? '选择导出内容和格式，整理本次建模输出。'
        : effectiveWorkflowStep === 'model'
          ? '先确定模型类型，右侧只保留模型选择和参数调整。'
          : effectiveWorkflowStep === 'upload'
            ? '导入 CSV 或 XLSX 文件，随后确认 ID、时间和分组字段。'
            : effectiveWorkflowStep === 'roles'
              ? '把 ID、时间和分组字段从模型变量中剥离，避免误入回归。'
              : effectiveWorkflowStep === 'variables'
                ? '在弹窗中设置因变量、核心自变量、控制变量和必要推断参数。'
                : effectiveWorkflowStep === 'run'
                  ? '运行过程中参数锁定，完成后自动进入结果阅读。'
                  : '从系数估计开始，再阅读核心结论和稳定性检验。'
  const primaryParameterSections = parameterSections.filter((section) => section.id !== 'advanced')
  const advancedSchemaSections = parameterSections.filter((section) => section.id === 'advanced')
  const selectedSnapshotIdSet = useMemo(() => new Set(selectedSnapshotIds), [selectedSnapshotIds])
  const sortedSnapshots = useMemo(
    () =>
      [...snapshots].sort((left, right) => {
        const pinnedDelta = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
        if (pinnedDelta !== 0) return pinnedDelta

        const favoriteDelta = Number(Boolean(right.favorite)) - Number(Boolean(left.favorite))
        if (favoriteDelta !== 0) return favoriteDelta

        return new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime()
      }),
    [snapshots],
  )
  const filteredSnapshots = useMemo(() => {
    if (snapshotViewFilter === 'pinned') return sortedSnapshots.filter((snapshot) => snapshot.pinned)
    if (snapshotViewFilter === 'favorite') return sortedSnapshots.filter((snapshot) => snapshot.favorite)
    return sortedSnapshots
  }, [snapshotViewFilter, sortedSnapshots])
  const visibleSnapshots = useMemo(
    () => (snapshotViewFilter === 'recent' ? filteredSnapshots.slice(0, 3) : filteredSnapshots),
    [filteredSnapshots, snapshotViewFilter],
  )
  const visibleSnapshotIds = useMemo(() => visibleSnapshots.map((snapshot) => snapshot.id), [visibleSnapshots])
  const selectedSnapshots = useMemo(() => snapshots.filter((snapshot) => selectedSnapshotIdSet.has(snapshot.id)), [selectedSnapshotIdSet, snapshots])
  const selectedSnapshotsAllPinned = selectedSnapshots.length > 0 && selectedSnapshots.every((snapshot) => snapshot.pinned)
  const selectedSnapshotsAllFavorite = selectedSnapshots.length > 0 && selectedSnapshots.every((snapshot) => snapshot.favorite)
  const snapshotSummaryText =
    snapshotViewFilter === 'recent'
      ? `最近 ${Math.min(3, sortedSnapshots.length)} 条`
      : `${filteredSnapshots.length} 条`

  const applyRows = (nextRows: Row[], nextFileName: string, nextDataRoles = emptyDataRoles) => {
    const cleaned = nextRows.filter((row) => Object.values(row).some((value) => value !== null && value !== ''))
    if (cleaned.length === 0) {
      setUploadError('文件没有可读取的数据。')
      return
    }

    setRows(cleaned)
    setFileName(nextFileName)
    setDataRoles(nextDataRoles)
    setModelConfig(createEmptyModelConfig(activeModel))
    setTypeOverrides({})
    setUploadError('')
    setRunState({
      result: null,
      error: '',
      logs: [{ level: 'info', message: '数据已导入，请设置变量后运行模型。' }],
      signature: '',
    })
    setRunTask(null)
    setRunFailureDialog(null)
    setRunStatus('')
    setWorkflowStep('roles')
  }

  const startImportWizard = (cleanedRows: Row[], nextFileName: string) => {
    setPendingImport({
      fileName: nextFileName,
      rows: cleanedRows,
      roles: inferDataRoles(cleanedRows),
    })
    setUploadError('')
  }

  const openImportWizard = (nextRows: Row[], nextFileName: string) => {
    const cleaned = nextRows.filter((row) => Object.values(row).some((value) => value !== null && value !== ''))
    if (cleaned.length === 0) {
      setUploadError('文件没有可读取的数据。')
      return
    }

    const missingSummary = summarizeMissingValues(cleaned, nextFileName)
    if (missingSummary) {
      setPendingImport(null)
      setMissingValueAlert(missingSummary)
      setUploadError('')
      return
    }

    startImportWizard(cleaned, nextFileName)
  }

  const continueImportAfterMissingAlert = () => {
    if (!missingValueAlert) return

    startImportWizard(missingValueAlert.rows, missingValueAlert.fileName)
    setMissingValueAlert(null)
  }

  const cancelMissingValueImport = () => {
    setMissingValueAlert(null)
    setUploadError('')
  }

  const confirmImport = () => {
    if (!pendingImport) return

    applyRows(pendingImport.rows, pendingImport.fileName, pendingImport.roles)
    setPendingImport(null)
  }

  const updatePendingRoles = (updater: (roles: DataRoles) => DataRoles) => {
    setPendingImport((current) => (current ? { ...current, roles: updater(current.roles) } : current))
  }

  const togglePendingRoleField = (kind: 'id' | 'group', field: string) => {
    updatePendingRoles((current) => {
      if (kind === 'id') {
        const nextIdFields = current.idFields.includes(field)
          ? withoutField(current.idFields, field)
          : [...current.idFields, field]

        return {
          idFields: nextIdFields,
          timeField: current.timeField === field ? '' : current.timeField,
          groupFields: withoutField(current.groupFields, field),
        }
      }

      const nextGroupFields = current.groupFields.includes(field)
        ? withoutField(current.groupFields, field)
        : [...current.groupFields, field]

      return {
        idFields: withoutField(current.idFields, field),
        timeField: current.timeField === field ? '' : current.timeField,
        groupFields: nextGroupFields,
      }
    })
  }

  const setPendingTimeField = (field: string) => {
    updatePendingRoles((current) => ({
      idFields: withoutField(current.idFields, field),
      timeField: field,
      groupFields: withoutField(current.groupFields, field),
    }))
  }

  const setDataFieldRole = (field: string, role: string) => {
    setDataRoles((current) => {
      const baseRoles = {
        idFields: withoutField(current.idFields, field),
        timeField: current.timeField === field ? '' : current.timeField,
        groupFields: withoutField(current.groupFields, field),
      }

      if (role === 'id') {
        return { ...baseRoles, idFields: [...baseRoles.idFields, field] }
      }

      if (role === 'time') {
        return { ...baseRoles, timeField: field }
      }

      if (role === 'group') {
        return { ...baseRoles, groupFields: [...baseRoles.groupFields, field] }
      }

      return baseRoles
    })
  }

  const switchModel = (modelId: string) => {
    if (isModelRunning) return
    const nextModel = getModelPlugin(modelId)
    setActiveModelId(nextModel.id)
    setDraftModelId(nextModel.id)
    setModelConfig(createEmptyModelConfig(nextModel))
    setUploadError('')
    setRunState({
      result: null,
      error: '',
      logs: [{ level: 'info', message: `已切换到${nextModel.name}，请重新设置变量后运行。` }],
      signature: '',
    })
    setRunTask(null)
    setRunFailureDialog(null)
    setRunStatus('')
    setWorkspaceTab('workbench')
    setModelUsage((current) => {
      const previous = current[nextModel.id]
      return {
        ...current,
        [nextModel.id]: {
          usedCount: (previous?.usedCount ?? 0) + 1,
          lastUsedAt: new Date().toISOString(),
        },
      }
    })
    setModelSearch('')
    setIsModelLibraryOpen(false)
    setWorkflowStep(hasDataset ? 'variables' : 'model')
    setIsVariableSetupOpen(false)
  }

  const openModelLibrary = () => {
    if (isModelRunning) return
    setDraftModelId(null)
    setIsModelLibraryOpen(true)
  }

  const applyDraftModel = () => {
    if (isModelRunning || !draftModel) return
    switchModel(draftModel.id)
  }

  const buildRunLogs = (baseLogs: RunLogEntry[], nextResult: ModelResult) =>
    [
      ...baseLogs,
      ...(modelMaturity.level === 'stable'
        ? []
        : [{ level: 'warning', message: `${activeModel.name}当前为${modelMaturity.label}能力：${modelMaturity.description}` } satisfies RunLogEntry]),
      ...(activeModel.limitations?.map((message) => ({ level: 'warning' as const, message })) ?? []),
      ...(nextResult.warnings?.map((message) => ({ level: 'warning' as const, message })) ?? []),
      { level: 'info', message: `${activeModel.name}运行完成。` } satisfies RunLogEntry,
    ] satisfies RunLogEntry[]

  const updateRunTask = (status: RunTaskStatus, phase: string, progress: number) => {
    setRunStatus(phase)
    setRunTask((current) =>
      current
        ? {
            ...current,
            status,
            phase,
            progress: Math.max(current.progress, progress),
            elapsedMs: Date.now() - current.startedAt,
          }
        : current,
    )
  }

  const cancelRunTask = () => {
    if (!isModelRunning) return
    runCancelRef.current = true
    runWorkerRef.current?.terminate()
    runWorkerRef.current = null
    setIsModelRunning(false)
    setRunStatus('')
    setRunTask((current) =>
      current
        ? {
            ...current,
            status: 'cancelled',
            phase: '任务已取消，参数面板已解锁。',
            elapsedMs: Date.now() - current.startedAt,
          }
        : current,
    )
    setRunState({
      result: null,
      error: '',
      logs: [{ level: 'warning', message: '用户已取消本次模型运行。' }],
      signature: currentRunSignature,
    })
    setRunFailureDialog(null)
    setWorkflowStep('variables')
  }

  const handleRunModel = () => {
    if (!hasDataset || !hasActiveModel || isModelRunning) return
    if (validationErrors.length > 0) {
      setWorkflowStep('variables')
      setIsVariableSetupOpen(true)
      setRunState({
        result: null,
        error: `请先选择变量后再运行：${validationErrors[0]?.message ?? '变量设定未完成。'}`,
        logs: validationErrors.map((issue) => ({ level: 'warning' as const, message: issue.message })),
        signature: currentRunSignature,
      })
      return
    }

    setUploadError('')
    setRunFailureDialog(null)
    runWorkerRef.current?.terminate()
    runCancelRef.current = false
    const taskId = `${Date.now()}-${activeModel.id}`
    const estimatedMs = estimateRunDuration(activeModel.id, rows.length)
    setIsModelRunning(true)
    setWorkflowStep('run')
    setRunStatus('创建运行任务。')
    setRunTask({
      id: taskId,
      modelName: activeModel.name,
      status: 'preparing',
      phase: '创建运行任务。',
      progress: 6,
      startedAt: Date.now(),
      elapsedMs: 0,
      estimatedMs,
    })

    const completeRun = (result: ModelResult, logs: RunLogEntry[]) => {
      if (runCancelRef.current) return
      setRunState({
        result,
        error: '',
        logs: buildRunLogs(logs, result),
        signature: currentRunSignature,
      })
      setRunTask((current) =>
        current
          ? {
              ...current,
              status: 'completed',
              phase: '运行完成。',
              progress: 100,
              elapsedMs: Date.now() - current.startedAt,
            }
          : current,
      )
      setIsModelRunning(false)
      setRunStatus('')
      runWorkerRef.current = null
      setRunFailureDialog(null)
      setWorkflowStep('results')
    }

    const failRun = (message: string) => {
      if (runCancelRef.current) return
      setRunState({
        result: null,
        error: message,
        logs: [{ level: 'warning', message }],
        signature: currentRunSignature,
      })
      setRunTask((current) =>
        current
          ? {
              ...current,
              status: 'failed',
              phase: message,
              progress: current.progress,
              elapsedMs: Date.now() - current.startedAt,
            }
          : current,
      )
      setIsModelRunning(false)
      setRunStatus('')
      runWorkerRef.current = null
      setRunFailureDialog({
        message,
        modelName: activeModel.name,
        formula: activeModel.getFormula(sanitizedConfig),
      })
      setWorkflowStep('variables')
    }

    const startBrowserWorker = (prefixLogs: RunLogEntry[] = []) => {
      const worker = new Worker(new URL('./workers/modelRunner.ts', import.meta.url), { type: 'module' })
      runWorkerRef.current = worker
      worker.onmessage = (event: MessageEvent<ModelWorkerMessage>) => {
        const message = event.data
        if (message.taskId !== taskId || runCancelRef.current) return

        if (message.type === 'progress') {
          updateRunTask(
            message.status,
            (slowModelIds.has(activeModel.id) || activeModel.id.startsWith('spatial-')) && message.status === 'estimating' ? '估计模型中，慢模型可能需要更长时间。' : message.phase,
            message.progress,
          )
          return
        }

        if (message.type === 'success') {
          completeRun(message.result, [...prefixLogs, ...message.logs])
          worker.terminate()
          return
        }

        failRun(message.error)
        worker.terminate()
      }

      worker.onerror = () => {
        const message = '模型运行进程异常退出。'
        failRun(message)
        worker.terminate()
      }

      worker.postMessage({
        taskId,
        modelId: activeModel.id,
        rows,
        profiles,
        config: sanitizedConfig,
        prepConfig,
        inference: activeModel.supportsInference ? effectiveInference : undefined,
      })
    }

    startBrowserWorker()
  }

  const openVariableSetup = () => {
    if (!hasDataset || !hasActiveModel || isModelRunning) return
    setWorkflowStep('variables')
    setIsVariableSetupOpen(true)
  }

  const saveVariableSetup = () => {
    setWorkflowStep('variables')
    setIsVariableSetupOpen(false)
  }

  const saveVariableSetupAndRun = () => {
    if (validationErrors.length > 0) return
    setIsVariableSetupOpen(false)
    handleRunModel()
  }

  const persistSnapshots = (nextSnapshots: WorkbenchSnapshot[]) => {
    setSnapshots(nextSnapshots)
    try {
      window.localStorage.setItem(snapshotStorageKey, JSON.stringify(nextSnapshots))
    } catch {
      setUploadError('快照保存失败：浏览器本地存储空间不足。')
    }
  }

  const saveSnapshot = () => {
    if (!hasDataset || !hasActiveModel) return

    const createdAt = new Date().toISOString()
    const snapshot: WorkbenchSnapshot = {
      id: `${Date.now()}`,
      createdAt,
      updatedAt: createdAt,
      label: `${activeModel.name} · ${fileName}`,
      fileName,
      rowCount: rows.length,
      fieldCount: profiles.length,
      modelId: activeModel.id,
      modelName: activeModel.name,
      modelShortName: activeModel.shortName || activeModel.name,
      formula: activeModel.getFormula(sanitizedConfig),
      rows,
      dataRoles,
      typeOverrides,
      prepConfig,
      inferenceConfig: effectiveInference,
      modelConfig: sanitizedConfig,
      result: result ?? undefined,
      resultLogs: result ? (runLogs as RunLogEntry[]) : undefined,
      savedResultAt: result ? createdAt : undefined,
      favorite: false,
      pinned: false,
      tags: [],
    }

    persistSnapshots([snapshot, ...snapshots].slice(0, 30))
  }

  const restoreSnapshot = (snapshot: WorkbenchSnapshot) => {
    setRows(snapshot.rows)
    setFileName(snapshot.fileName)
    setDataRoles(snapshot.dataRoles ?? emptyDataRoles)
    setTypeOverrides(snapshot.typeOverrides)
    setPrepConfig(snapshot.prepConfig)
    setInferenceConfig(snapshot.inferenceConfig ?? { standardError: 'ols', clusterField: '' })
    setActiveModelId(snapshot.modelId)
    setDraftModelId(snapshot.modelId)
    setModelConfig(snapshot.modelConfig)
    if (snapshot.result) {
      const snapshotProfiles = profileRows(snapshot.rows, snapshot.typeOverrides)
      const snapshotModel = getModelPlugin(snapshot.modelId)
      setRunState({
        result: snapshot.result,
        error: '',
        logs: snapshot.resultLogs ?? [{ level: 'info', message: '已从历史记录恢复保存的模型结果。' }],
        signature: createRunSignature({
          modelId: snapshot.modelId,
          fileName: snapshot.fileName,
          rowCount: snapshot.rows.length,
          fields: snapshotProfiles.map((profile) => [profile.name, profile.type, profile.missing, profile.unique]),
          dataRoles: snapshot.dataRoles ?? emptyDataRoles,
          prepConfig: snapshot.prepConfig,
          inference: snapshotModel.supportsInference ? (snapshot.inferenceConfig ?? { standardError: 'ols', clusterField: '' }) : undefined,
          config: snapshot.modelConfig,
        }),
      })
    }
    setUploadError('')
    setSelectedSnapshotIds([])
    setIsSnapshotManageMode(false)
  }

  const startRenameSnapshot = (snapshot: WorkbenchSnapshot) => {
    setRenamingSnapshotId(snapshot.id)
    setSnapshotNameDraft(snapshot.label)
  }

  const cancelRenameSnapshot = () => {
    setRenamingSnapshotId('')
    setSnapshotNameDraft('')
  }

  const commitRenameSnapshot = (snapshotId: string) => {
    const nextLabel = snapshotNameDraft.trim()
    if (!nextLabel) return

    persistSnapshots(snapshots.map((snapshot) => (snapshot.id === snapshotId ? { ...snapshot, label: nextLabel, updatedAt: new Date().toISOString() } : snapshot)))
    cancelRenameSnapshot()
  }

  const toggleSnapshotFlag = (snapshotId: string, flag: 'favorite' | 'pinned') => {
    persistSnapshots(
      snapshots.map((snapshot) =>
        snapshot.id === snapshotId ? { ...snapshot, [flag]: !snapshot[flag], updatedAt: new Date().toISOString() } : snapshot,
      ),
    )
  }

  const toggleSnapshotSelection = (snapshotId: string) => {
    setSelectedSnapshotIds((current) =>
      current.includes(snapshotId) ? current.filter((id) => id !== snapshotId) : [...current, snapshotId],
    )
  }

  const toggleAllSnapshots = () => {
    setSelectedSnapshotIds((current) => {
      const visibleIdSet = new Set(visibleSnapshotIds)
      const allVisibleSelected = visibleSnapshotIds.length > 0 && visibleSnapshotIds.every((id) => current.includes(id))
      if (allVisibleSelected) return current.filter((id) => !visibleIdSet.has(id))

      return [...new Set([...current, ...visibleSnapshotIds])]
    })
  }

  const setSelectedSnapshotFlag = (flag: 'favorite' | 'pinned', value: boolean) => {
    if (selectedSnapshotIds.length === 0) return

    persistSnapshots(
      snapshots.map((snapshot) =>
        selectedSnapshotIdSet.has(snapshot.id) ? { ...snapshot, [flag]: value, updatedAt: new Date().toISOString() } : snapshot,
      ),
    )
  }

  const deleteSelectedSnapshots = () => {
    if (selectedSnapshotIds.length === 0) return
    const confirmed = window.confirm(`确定删除选中的 ${selectedSnapshotIds.length} 条快照吗？`)
    if (!confirmed) return

    persistSnapshots(snapshots.filter((snapshot) => !selectedSnapshotIdSet.has(snapshot.id)))
    setSelectedSnapshotIds([])
    setIsSnapshotManageMode(false)
  }

  const deleteSnapshot = (snapshot: WorkbenchSnapshot) => {
    const confirmed = window.confirm(`确定删除快照“${snapshot.label}”吗？此操作只会删除这条本地历史记录。`)
    if (!confirmed) return

    persistSnapshots(snapshots.filter((entry) => entry.id !== snapshot.id))
    setSelectedSnapshotIds((current) => current.filter((id) => id !== snapshot.id))
    if (renamingSnapshotId === snapshot.id) {
      cancelRenameSnapshot()
    }
  }

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    if (!hasActiveModel) {
      setUploadError('')
      setWorkflowStep('model')
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase()

    if (extension === 'xlsx') {
      try {
        const sheetRows = await readSheet(file)
        openImportWizard(rowsFromSheet(sheetRows), file.name)
      } catch {
        setUploadError('XLSX 解析失败，请确认第一张工作表是标准二维表。')
      }
      return
    }

    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: ({ data }) => {
        openImportWizard(data.filter((row) => Object.keys(row).length > 0), file.name)
      },
      error: () => setUploadError('CSV 解析失败，请检查文件格式。'),
    })
  }

  const toggleFeature = (name: string) => {
    setModelConfig((current) => ({
      ...current,
      features: current.features.includes(name)
        ? current.features.filter((feature) => feature !== name)
        : [...current.features, name],
    }))
  }

  const setSchemaParamColumn = (field: ParameterField, value: string) => {
    setModelConfig((current) => {
      const nextParams = { ...(current.params ?? {}), [field.id]: value }

      if (field.role === 'target') {
        activeModel.parameterSchema?.forEach((schemaField) => {
          if (schemaField.kind === 'columns' && Array.isArray(nextParams[schemaField.id])) {
            nextParams[schemaField.id] = (nextParams[schemaField.id] as string[]).filter((entry) => entry !== value)
          }
          if (schemaField.kind === 'column' && schemaField.id !== field.id && nextParams[schemaField.id] === value) {
            nextParams[schemaField.id] = ''
          }
        })

        return {
          ...current,
          target: field.id === 'target' ? value : current.target,
          features: current.features.filter((entry) => entry !== value),
          params: nextParams,
        }
      }

      return {
        ...current,
        params: nextParams,
      }
    })
  }

  const setParamNumber = (paramId: string, value: number) => {
    setModelConfig((current) => ({
      ...current,
      params: {
        ...current.params,
        [paramId]: value,
      },
    }))
  }

  const setParamValue = (paramId: string, value: ModelParamValue) => {
    setModelConfig((current) => ({
      ...current,
      params: {
        ...current.params,
        [paramId]: value,
      },
    }))
  }

  const importSpatialWeights = async (paramId: string, file: File | undefined) => {
    if (!file) return

    try {
      const text = await file.text()
      const weights = parseSpatialWeightsText(text, file.name)
      setParamValue(paramId, weights)
      setUploadError('')
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '空间权重文件解析失败。')
    }
  }

  const toggleParamColumn = (paramId: string, value: string, maxSelections?: number) => {
    setModelConfig((current) => {
      const currentValues = asParamArray(current.params?.[paramId])
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value].slice(maxSelections ? -maxSelections : 0)
      const nextParams = {
        ...current.params,
        [paramId]: nextValues,
      }

      if (!currentValues.includes(value)) {
        if (paramId === 'features') {
          nextParams.controls = asParamArray(nextParams.controls).filter((entry) => entry !== value)
        }
        if (paramId === 'controls') {
          nextParams.features = asParamArray(nextParams.features).filter((entry) => entry !== value)
        }
      }

      return {
        ...current,
        params: nextParams,
      }
    })
  }

  const updateColumnType = (column: string, type: ColumnType) => {
    setTypeOverrides((current) => ({ ...current, [column]: type }))
  }

  const downloadBlob = (content: BlobPart[], type: string, filename: string) => {
    const blob = new Blob(content, { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const getExportSelection = () => (selectedExportItemIds.length > 0 ? selectedExportItemIds : exportItems.map((item) => item.id))

  const getSelectedResultTables = (selectedIds: string[]) =>
    [...(result?.tables.filter((table) => selectedIds.includes(`table:${table.id}`)) ?? [])].sort((left, right) => {
      if (left.id === 'coefficients') return -1
      if (right.id === 'coefficients') return 1
      return 0
    })

  const getCoefficientTable = () => result?.tables.find((table) => table.id === 'coefficients') ?? null

  const buildStataRows = () => {
    const coefficientTable = getCoefficientTable()
    if (!coefficientTable) return []

    return [
      ['Variable', 'Coef.', 'Std. err.', 'P>|t|'],
      ...coefficientTable.rows.map((row) => [
        String(row.term ?? row.variable ?? ''),
        formatResultValue(row.coefficient ?? '', 'coefficient'),
        row.stdError === undefined ? '' : formatResultValue(row.stdError, 'stdError'),
        row.pValue === undefined ? '' : formatResultValue(row.pValue, 'pValue'),
      ]),
    ]
  }

  function buildPublicationRegressionTable() {
    if (!result || !hasActiveModel) return null
    return buildBaselinePublicationTable({
      result,
      config: sanitizedConfig,
      dimensions: dataRoles,
      modelLabel: activeModel.shortName || activeModel.name,
      methodLabel: activeModel.methodLabel || activeModel.shortName || activeModel.name,
    })
  }

  const buildPublicationRegressionRows = () => {
    const table = buildPublicationRegressionTable()
    return table ? publicationTableToRows(table, { includeNotes: true }) : []
  }

  function buildCustomPublicationTableFromConfig() {
    if (isCustomPublicationDefaultTableMode) return buildPublicationRegressionTable()

    const sources: CustomPublicationSource[] = selectedPublicationSources.map((source, index) => {
        const draft = customPublicationConfig.columns[source.id]
        return {
          id: source.id,
          result: source.result,
          config: source.config,
          dimensions: source.dimensions,
          label: draft?.label || `(${index + 1})`,
          group: draft?.group?.trim() || undefined,
          modelLabel: draft?.modelLabel?.trim() || source.modelShortName || source.modelName,
          modelShortName: source.modelShortName,
          modelName: source.modelName,
        }
      })

    return buildCustomPublicationTable({
      title: customPublicationConfig.title,
      note: customPublicationConfig.note,
      sources,
      variableOrder: orderedCustomPublicationVariableOptions
        .filter((option) => !hiddenCustomPublicationVariableSet.has(option.id))
        .map((option) => option.id),
      enabledStatisticIds: customPublicationStatisticOptions
        .filter((option) => !disabledCustomPublicationStatisticSet.has(option.id))
        .map((option) => option.id),
      variableLabels: customPublicationConfig.variableLabels,
      statisticLabels: customPublicationConfig.statisticLabels,
      formatRules: customPublicationConfig.formatRules,
    })
  }

  const customPublicationAsCustom = (current: CustomPublicationConfig): CustomPublicationConfig => ({
    ...current,
    mode: 'custom',
    selectedSourceIds: current.selectedSourceIds.length > 0 ? current.selectedSourceIds : defaultCustomPublicationSourceIds,
  })

  const startCustomPublicationEditing = () => {
    setCustomPublicationConfig((current) => customPublicationAsCustom(current))
  }

  const updateCustomPublicationConfig = (patch: Partial<Pick<CustomPublicationConfig, 'title' | 'note'>>) => {
    setCustomPublicationConfig((current) => ({ ...customPublicationAsCustom(current), ...patch }))
  }

  const updateCustomPublicationFormatRules = (patch: Partial<CustomPublicationFormatRules>) => {
    setCustomPublicationConfig((current) => {
      const customCurrent = customPublicationAsCustom(current)
      const nextFormatRules = {
        ...customCurrent.formatRules,
        ...patch,
        starLevels: patch.starLevels ? patch.starLevels : customCurrent.formatRules.starLevels,
      }
      const currentAutoNote = buildCustomPublicationNote(customCurrent.formatRules)
      return {
        ...customCurrent,
        formatRules: nextFormatRules,
        note: customCurrent.note.trim() === '' || customCurrent.note === currentAutoNote ? buildCustomPublicationNote(nextFormatRules) : customCurrent.note,
      }
    })
  }

  const toggleCustomPublicationSource = (sourceId: string) => {
    setCustomPublicationConfig((current) => {
      const customCurrent = customPublicationAsCustom(current)
      const baseSelected = customCurrent.selectedSourceIds.length > 0 ? customCurrent.selectedSourceIds : effectiveCustomPublicationSourceIds
      const selected = baseSelected.includes(sourceId)
        ? baseSelected.filter((id) => id !== sourceId)
        : [...baseSelected, sourceId]
      return { ...customCurrent, selectedSourceIds: selected }
    })
  }

  const updateCustomPublicationColumn = (sourceId: string, patch: Partial<Omit<CustomPublicationColumnDraft, 'id'>>) => {
    setCustomPublicationConfig((current) => {
      const customCurrent = customPublicationAsCustom(current)
      return {
      ...customCurrent,
      columns: {
        ...customCurrent.columns,
        [sourceId]: {
          id: sourceId,
          label: customCurrent.columns[sourceId]?.label ?? `(${Object.keys(customCurrent.columns).length + 1})`,
          group: customCurrent.columns[sourceId]?.group ?? '',
          modelLabel: customCurrent.columns[sourceId]?.modelLabel ?? '',
          ...patch,
        },
      },
    }
    })
  }

  const moveCustomPublicationColumn = (sourceId: string, direction: 'up' | 'down') => {
    setCustomPublicationConfig((current) => {
      const customCurrent = customPublicationAsCustom(current)
      const availableIds = selectedPublicationSources.map((source) => source.id)
      const orderedIds = [
        ...customCurrent.columnOrder.filter((id) => availableIds.includes(id)),
        ...availableIds.filter((id) => !customCurrent.columnOrder.includes(id)),
      ]
      const index = orderedIds.indexOf(sourceId)
      if (index === -1) return customCurrent
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= orderedIds.length) return customCurrent
      return { ...customCurrent, columnOrder: moveOrderedItem(orderedIds, sourceId, nextIndex) }
    })
  }

  const updateCustomPublicationVariableLabel = (variableId: string, label: string) => {
    setCustomPublicationConfig((current) => ({
      ...customPublicationAsCustom(current),
      variableLabels: {
        ...current.variableLabels,
        [variableId]: label,
      },
    }))
  }

  const toggleCustomPublicationVariable = (variableId: string) => {
    setCustomPublicationConfig((current) => {
      const customCurrent = customPublicationAsCustom(current)
      const hidden = customCurrent.hiddenVariableIds.includes(variableId)
        ? customCurrent.hiddenVariableIds.filter((id) => id !== variableId)
        : [...customCurrent.hiddenVariableIds, variableId]
      return { ...customCurrent, hiddenVariableIds: hidden }
    })
  }

  const moveCustomPublicationVariable = (variableId: string, direction: 'up' | 'down') => {
    setCustomPublicationConfig((current) => {
      const customCurrent = customPublicationAsCustom(current)
      const availableIds = customPublicationVariableOptions.map((option) => option.id)
      const orderedIds = [
        ...customCurrent.variableOrder.filter((id) => availableIds.includes(id)),
        ...availableIds.filter((id) => !customCurrent.variableOrder.includes(id)),
      ]
      const index = orderedIds.indexOf(variableId)
      if (index === -1) return customCurrent
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= orderedIds.length) return customCurrent
      return { ...customCurrent, variableOrder: moveOrderedItem(orderedIds, variableId, nextIndex) }
    })
  }

  const moveCustomPublicationStatistic = (statisticId: string, direction: 'up' | 'down') => {
    setCustomPublicationConfig((current) => {
      const customCurrent = customPublicationAsCustom(current)
      const availableIds = customPublicationStatisticOptions.map((option) => option.id)
      const orderedIds = [
        ...customCurrent.statisticOrder.filter((id) => availableIds.includes(id)),
        ...availableIds.filter((id) => !customCurrent.statisticOrder.includes(id)),
      ]
      const index = orderedIds.indexOf(statisticId)
      if (index === -1) return customCurrent
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= orderedIds.length) return customCurrent
      return { ...customCurrent, statisticOrder: moveOrderedItem(orderedIds, statisticId, nextIndex) }
    })
  }

  const updateCustomPublicationStatisticLabel = (statisticId: string, label: string) => {
    setCustomPublicationConfig((current) => ({
      ...customPublicationAsCustom(current),
      statisticLabels: {
        ...current.statisticLabels,
        [statisticId]: label,
      },
    }))
  }

  const toggleCustomPublicationStatistic = (statisticId: string) => {
    setCustomPublicationConfig((current) => {
      const customCurrent = customPublicationAsCustom(current)
      const disabled = customCurrent.disabledStatisticIds.includes(statisticId)
        ? customCurrent.disabledStatisticIds.filter((id) => id !== statisticId)
        : [...customCurrent.disabledStatisticIds, statisticId]
      return { ...customCurrent, disabledStatisticIds: disabled }
    })
  }

  const resetCustomPublicationOrdering = () => {
    setCustomPublicationConfig((current) => ({
      ...customPublicationAsCustom(current),
      columnOrder: [],
      variableOrder: [],
      statisticOrder: [],
    }))
  }

  const setAllCustomPublicationVariables = (visible: boolean) => {
    setCustomPublicationConfig((current) => ({
      ...customPublicationAsCustom(current),
      hiddenVariableIds: visible ? [] : orderedCustomPublicationVariableOptions.map((option) => option.id),
    }))
  }

  const setAllCustomPublicationStatistics = (enabled: boolean) => {
    setCustomPublicationConfig((current) => ({
      ...customPublicationAsCustom(current),
      disabledStatisticIds: enabled ? [] : customPublicationStatisticOptions.map((option) => option.id),
    }))
  }

  const saveCustomPublicationTemplate = () => {
    const name = customPublicationConfig.title.trim() || `自定义论文表模板 ${customPublicationTemplates.length + 1}`
    const template: CustomPublicationTemplate = {
      id: crypto.randomUUID(),
      name,
      updatedAt: new Date().toISOString(),
      config: structuredClone({ ...customPublicationAsCustom(customPublicationConfig), mode: 'custom' }),
    }
    setCustomPublicationTemplates((current) => [template, ...current.filter((entry) => entry.name !== name)])
  }

  const restoreCustomPublicationDefaults = () => {
    setCustomPublicationConfig(defaultCustomPublicationConfig())
  }

  const openPublicationWorkbench = () => {
    setExportError('')
    setIsExportModalOpen(false)
    setWorkspaceTab('publication')
  }

  const closePublicationWorkbench = () => {
    setExportError('')
    setWorkspaceTab('workbench')
  }

  const applyCustomPublicationTemplate = (templateId: string) => {
    const template = customPublicationTemplates.find((entry) => entry.id === templateId)
    if (!template) return
    setCustomPublicationConfig(customPublicationAsCustom({ ...normalizeCustomPublicationConfig(structuredClone(template.config)), mode: 'custom' }))
  }

  const applyDefaultCustomPublicationTemplate = () => {
    if (customPublicationDefaultTemplateId) applyCustomPublicationTemplate(customPublicationDefaultTemplateId)
  }

  const duplicateCustomPublicationTemplate = (templateId: string) => {
    const template = customPublicationTemplates.find((entry) => entry.id === templateId)
    if (!template) return
    setCustomPublicationTemplates((current) => [
      {
        ...template,
        id: crypto.randomUUID(),
        name: `${template.name}（副本）`,
        updatedAt: new Date().toISOString(),
      },
      ...current,
    ])
  }

  const renameCustomPublicationTemplate = (templateId: string, name: string) => {
    setCustomPublicationTemplates((current) =>
      current.map((entry) => (entry.id === templateId ? { ...entry, name, updatedAt: new Date().toISOString() } : entry)),
    )
  }

  const deleteCustomPublicationTemplate = (templateId: string) => {
    setCustomPublicationTemplates((current) => current.filter((entry) => entry.id !== templateId))
    if (customPublicationDefaultTemplateId === templateId) setCustomPublicationDefaultTemplateId('')
  }

  const reorderCustomPublicationByDrop = (kind: CustomPublicationDragItem['kind'], targetId: string) => {
    if (!draggingPublicationItem || draggingPublicationItem.kind !== kind || draggingPublicationItem.id === targetId) return
    if (kind === 'column') {
      setCustomPublicationConfig((current) => {
        const customCurrent = customPublicationAsCustom(current)
        const availableIds = selectedPublicationSources.map((source) => source.id)
        const orderedIds = [
          ...customCurrent.columnOrder.filter((id) => availableIds.includes(id)),
          ...availableIds.filter((id) => !customCurrent.columnOrder.includes(id)),
        ]
        return { ...customCurrent, columnOrder: moveOrderedItem(orderedIds, draggingPublicationItem.id, orderedIds.indexOf(targetId)) }
      })
    }
    if (kind === 'variable') {
      setCustomPublicationConfig((current) => {
        const customCurrent = customPublicationAsCustom(current)
        const availableIds = orderedCustomPublicationVariableOptions.map((option) => option.id)
        const orderedIds = [
          ...customCurrent.variableOrder.filter((id) => availableIds.includes(id)),
          ...availableIds.filter((id) => !customCurrent.variableOrder.includes(id)),
        ]
        return { ...customCurrent, variableOrder: moveOrderedItem(orderedIds, draggingPublicationItem.id, orderedIds.indexOf(targetId)) }
      })
    }
    if (kind === 'statistic') {
      setCustomPublicationConfig((current) => {
        const customCurrent = customPublicationAsCustom(current)
        const availableIds = customPublicationStatisticOptions.map((option) => option.id)
        const orderedIds = [
          ...customCurrent.statisticOrder.filter((id) => availableIds.includes(id)),
          ...availableIds.filter((id) => !customCurrent.statisticOrder.includes(id)),
        ]
        return { ...customCurrent, statisticOrder: moveOrderedItem(orderedIds, draggingPublicationItem.id, orderedIds.indexOf(targetId)) }
      })
    }
    setDraggingPublicationItem(null)
  }

  const buildStataStyleTable = (selectedIds = getExportSelection()) => {
    if (!result || !selectedIds.includes('stata')) return ''
    const coefficientTable = result.tables.find((table) => table.id === 'coefficients')
    if (!coefficientTable) return ''
    const rows = coefficientTable.rows.map((row) => {
      const term = String(row.term ?? row.variable ?? '')
      const coefficient = formatResultValue(row.coefficient as string | number, 'coefficient')
      const stdError = row.stdError === undefined ? '' : `(${formatResultValue(row.stdError as string | number, 'stdError')})`
      const pValue = row.pValue === undefined ? '' : formatResultValue(row.pValue as string | number, 'pValue')
      return `<tr><td>${escapeXml(term)}</td><td>${escapeXml(coefficient)}</td><td>${escapeXml(stdError)}</td><td>${escapeXml(pValue)}</td></tr>`
    })

    return `<h2>Stata 风格回归表</h2><table><thead><tr><th>Variable</th><th>Coef.</th><th>Std. err.</th><th>P>|t|</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
  }

  const publicationTableCss = `
.publication-block{margin:18px 0 24px}
.publication-table{width:100%;border-collapse:collapse;table-layout:auto;margin:0;font-family:"Times New Roman","Noto Serif SC",serif;color:#000;background:#fff}
.three-line th,.three-line td{border:0;padding:2px 6px;font-size:12px;line-height:1.28;text-align:center;vertical-align:middle;background:#fff}
.three-line .row-label{text-align:left;white-space:nowrap}
.three-line .is-empty-label{color:transparent}
.three-line tr.row-role-title th{border-top:2px solid #000;border-bottom:2px solid #000;font-size:16px;font-weight:700;line-height:1.2;text-align:center;padding:3px 6px}
.three-line tr.row-role-model th,.three-line tr.row-role-group th{font-weight:400}
.three-line tr.is-last-header th{border-bottom:1.5px solid #000}
.three-line tr.row-role-coefficient td:first-child{font-weight:600}
.three-line tr.row-role-statistic td{padding-top:0;color:#000}
.three-line tr:last-child td,.three-line tr:last-child th{border-bottom:2px solid #000}
.three-line .is-centered{text-align:center}
.note{margin-top:4px;padding-top:0;border-top:0;font-size:12px;line-height:1.35;color:#000;font-family:"Times New Roman","Noto Serif SC",serif}
`

  function buildPublicationTableHtml(table: PublicationTable) {
    const mergeMap = new Map(table.merges.map((merge) => [`${merge.rowIndex}:${merge.columnIndex}`, merge.columnSpan]))
    const hiddenCells = new Set<string>()
    table.merges.forEach((merge) => {
      for (let offset = 1; offset < merge.columnSpan; offset += 1) hiddenCells.add(`${merge.rowIndex}:${merge.columnIndex + offset}`)
    })
    const rows = table.rows
      .map((row, rowIndex) => {
        const values = [row.label, ...row.values]
        const nextRole = table.rows[rowIndex + 1]?.role
        const isHeaderEnd = (row.role === 'header' || row.role === 'columnIndex') && nextRole !== 'header' && nextRole !== 'columnIndex'
        const rowClassNames = [`row-role-${row.role}`, isHeaderEnd ? 'is-last-header' : ''].filter(Boolean).join(' ')
        const cells = values
          .map((cell, cellIndex) => {
            if (hiddenCells.has(`${rowIndex}:${cellIndex}`)) return ''
            const tag = row.role === 'title' || row.role === 'model' || row.role === 'group' || row.role === 'header' || row.role === 'columnIndex' ? 'th' : 'td'
            const classNames = [
              cellIndex === 0 ? 'row-label' : '',
              `row-role-${row.role}`,
              row.role === 'statistic' && cellIndex === 0 ? 'is-empty-label' : '',
              cellIndex > 0 ? 'is-centered' : '',
            ]
              .filter(Boolean)
              .join(' ')
            const span = mergeMap.get(`${rowIndex}:${cellIndex}`)
            return `<${tag}${classNames ? ` class="${classNames}"` : ''}${span ? ` colspan="${span}"` : ''}>${escapeXml(cell)}</${tag}>`
          })
          .join('')
        return `<tr class="${rowClassNames}">${cells}</tr>`
      })
      .join('')

    const note = table.notes.join(' ')
    return `<figure class="publication-block"><table class="three-line publication-table"><tbody>${rows}</tbody></table><figcaption class="note">${escapeXml(note)}</figcaption></figure>`
  }

  const buildThreeLineTable = (selectedIds = getExportSelection()) => {
    if (!result || !selectedIds.includes('three-line')) return ''
    const table = buildPublicationRegressionTable()
    return table ? buildPublicationTableHtml(table) : ''
  }

  const buildHtmlReport = (selectedIds = getExportSelection()) => {
    if (!result || !hasActiveModel) return ''
    const tableHtml = getSelectedResultTables(selectedIds)
      .map(
        (table) =>
          `<h2>${escapeXml(table.title)}</h2><table><thead><tr>${table.columns
            .map((column) => `<th>${escapeXml(columnLabels[column] ?? column)}</th>`)
            .join('')}</tr></thead><tbody>${table.rows
            .map((row) => `<tr>${table.columns.map((column) => `<td>${escapeXml(formatResultValue(row[column] ?? '', column))}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`,
      )
      .join('')
    const summaryRows = selectedIds.includes('summary')
      ? `<h2>模型摘要</h2><table>${result.summary.map((metric) => `<tr><td>${escapeXml(metric.label)}</td><td>${escapeXml(formatMetricValue(metric))}</td></tr>`).join('')}</table>`
      : ''
    const logRows = selectedIds.includes('logs')
      ? `<h2>运行日志</h2><table><thead><tr><th>Level</th><th>Message</th></tr></thead><tbody>${runLogs.map((entry) => `<tr><td>${escapeXml(entry.level)}</td><td>${escapeXml(entry.message)}</td></tr>`).join('')}</tbody></table>`
      : ''
    const configBlock = selectedIds.includes('config') ? `<h2>参数配置 JSON</h2><pre>${escapeXml(JSON.stringify(sanitizedConfig, null, 2))}</pre>` : ''

    const customPublicationHtml =
      selectedIds.includes('custom-publication')
        ? (() => {
            const table = buildCustomPublicationTableFromConfig()
            return table ? buildPublicationTableHtml(table) : ''
          })()
        : ''

    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(activeModel.name)} 报告</title><style>
body{font-family:"Times New Roman","Noto Serif SC",serif;color:#1a1f26;margin:28px;line-height:1.65}h1{font-size:22px}h2{font-size:16px;margin:22px 0 8px}table{border-collapse:collapse;width:100%;margin:8px 0 14px}th,td{border:1px solid #d9ddd6;padding:6px 8px;font-size:12px;text-align:left}th{background:#f4f6f2}code{white-space:pre-wrap}${publicationTableCss}
</style></head><body><h1>${escapeXml(activeModel.name)}（${escapeXml(activeModel.shortName)}）</h1><p><strong>公式：</strong><code>${escapeXml(activeModel.getFormula(sanitizedConfig))}</code></p><p><strong>可信度：</strong>${escapeXml(modelMaturity.label)} · ${escapeXml(modelMaturity.description)}</p>${summaryRows}${buildStataStyleTable(selectedIds)}${buildThreeLineTable(selectedIds)}${customPublicationHtml}${tableHtml}${logRows}${configBlock}</body></html>`
  }

  const excelCell = (
    value: string | number,
    style: Partial<Extract<Cell, { value?: unknown }>> = {},
  ): Cell => ({
    value,
    type: typeof value === 'number' ? Number : String,
    align: typeof value === 'number' ? 'right' : 'left',
    ...style,
  })

  const publicationSheetData = (table: PublicationTable): SheetData => {
    const rows = publicationTableToRows(table, { includeNotes: true })
    const hiddenCells = new Set<string>()
    const mergeStarts = new Map<string, number>()

    table.merges.forEach((merge) => {
      mergeStarts.set(`${merge.rowIndex}:${merge.columnIndex}`, merge.columnSpan)
      for (let offset = 1; offset < merge.columnSpan; offset += 1) hiddenCells.add(`${merge.rowIndex}:${merge.columnIndex + offset}`)
    })

    return rows.map((row, rowIndex) =>
      row.map((cell, columnIndex) => {
        if (hiddenCells.has(`${rowIndex}:${columnIndex}`)) return null
        const role = rowIndex < table.rows.length ? table.rows[rowIndex].role : 'note'
        const nextRole = table.rows[rowIndex + 1]?.role
        const isHeader = role === 'title' || role === 'model' || role === 'group' || role === 'header' || role === 'columnIndex'
        const isStatistic = role === 'statistic'
        const isNote = role === 'note'
        const isTitleRow = role === 'title'
        const isHeaderEnd = (role === 'header' || role === 'columnIndex') && nextRole !== 'header' && nextRole !== 'columnIndex'
        const isLastTableRow = rowIndex === table.rows.length - 1
        const isCoefficientLabel = role === 'coefficient' && columnIndex === 0
        return excelCell(cell, {
          fontFamily: 'Times New Roman',
          fontSize: isTitleRow ? 14 : isNote ? 11 : 12,
          fontWeight: isTitleRow || isHeader || isCoefficientLabel ? 'bold' : undefined,
          align: isTitleRow || role === 'model' || role === 'group' || columnIndex > 0 ? 'center' : 'left',
          wrap: true,
          columnSpan: mergeStarts.get(`${rowIndex}:${columnIndex}`),
          backgroundColor: '#ffffff',
          topBorderStyle: isTitleRow ? 'medium' : undefined,
          bottomBorderStyle: isTitleRow || isLastTableRow ? 'medium' : isHeaderEnd ? 'thin' : undefined,
          leftBorderStyle: undefined,
          rightBorderStyle: undefined,
          textColor: '#000000',
          alignVertical: 'center',
          height: isTitleRow ? 22 : role === 'model' || role === 'group' || isHeaderEnd ? 17 : isNote ? 18 : isStatistic ? 15 : 18,
        })
      }),
    )
  }

  const buildExcelBlob = async (selectedIds = getExportSelection()) => {
    if (!result || !hasActiveModel) return new Blob([])
    const worksheetNames = new Set<string>()
    const worksheetName = (name: string) => {
      const base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet'
      let nextName = base
      let index = 2
      while (worksheetNames.has(nextName)) {
        const suffix = ` ${index}`
        nextName = `${base.slice(0, 31 - suffix.length)}${suffix}`
        index += 1
      }
      worksheetNames.add(nextName)
      return nextName
    }
    const asSheetData = (rows: Array<Array<string | number>>): SheetData =>
      rows.map((row, rowIndex) =>
        row.map((cell, columnIndex) => {
          const isHeader = rowIndex === 0
          return excelCell(cell, {
            fontFamily: 'Times New Roman',
            fontSize: 11,
            fontWeight: isHeader ? 'bold' : undefined,
            align: columnIndex > 0 ? 'center' : 'left',
            wrap: true,
          })
        }),
      )
    const tableRows = (table: ModelResult['tables'][number]) => [
      table.columns.map((column) => columnLabels[column] ?? column),
      ...table.rows.map((row) => table.columns.map((column) => formatResultValue(row[column] ?? '', column))),
    ]
    const sheets: Sheet<Blob>[] = []
    const appendSheet = (name: string, rows: Array<Array<string | number>>) => {
      const columnCount = Math.max(...rows.map((row) => row.length), 1)
      sheets.push({
        sheet: worksheetName(name),
        data: asSheetData(rows),
        columns: Array.from({ length: columnCount }, (_, columnIndex) => ({ width: columnIndex === 0 ? 18 : 13 })),
        showGridLines: true,
      })
    }
    const appendPublicationSheet = (table: PublicationTable) => {
      const columnCount = table.columns.length + 1
      const labelWidth = Math.min(26, Math.max(18, Math.max(...table.rows.map((row) => row.label.length), 10) * 1.45))
      const valueWidth = Math.min(
        18,
        Math.max(
          11,
          ...table.rows.flatMap((row) => row.values.map((value) => String(value ?? '').length * 1.18)),
        ),
      )
      sheets.push({
        sheet: worksheetName(table.sheetName),
        data: publicationSheetData(table),
        columns: Array.from({ length: columnCount }, (_, columnIndex) => ({ width: columnIndex === 0 ? labelWidth : valueWidth })),
        showGridLines: false,
      })
    }

    if (selectedIds.includes('summary')) appendSheet('模型摘要', [['Metric', 'Value'], ...result.summary.map((metric) => [metric.label, formatMetricValue(metric)])])
    getSelectedResultTables(selectedIds).forEach((table) => appendSheet(table.id === 'coefficients' ? '回归结果' : table.title, tableRows(table)))
    if (selectedIds.includes('stata')) appendSheet('Stata回归表', buildStataRows())
    if (selectedIds.includes('three-line')) {
      const publicationTable = buildPublicationRegressionTable()
      if (publicationTable) appendPublicationSheet(publicationTable)
    }
    if (selectedIds.includes('custom-publication')) {
      const publicationTable = buildCustomPublicationTableFromConfig()
      if (publicationTable) appendPublicationSheet(publicationTable)
    }
    if (selectedIds.includes('logs')) appendSheet('运行日志', [['Level', 'Message'], ...runLogs.map((entry) => [entry.level, entry.message])])
    if (selectedIds.includes('config')) appendSheet('参数配置', [['JSON'], [JSON.stringify(sanitizedConfig, null, 2)]])

    return writeXlsxFile(sheets, { fontFamily: 'Times New Roman', fontSize: 11 }).toBlob()
  }

  const buildCsvReport = (selectedIds = getExportSelection()) => {
    if (!result || !hasActiveModel) return ''
    const lines: string[] = []
    if (selectedIds.includes('summary')) {
      lines.push('模型摘要', csvLine(['字段', '值']), csvLine(['Model', activeModel.getFormula(sanitizedConfig)]))
      result.summary.forEach((metric) => lines.push(csvLine([metric.label, formatMetricValue(metric)])))
    }
    getSelectedResultTables(selectedIds).forEach((table) => {
      lines.push('', table.id === 'coefficients' ? '回归结果' : table.title, csvLine(table.columns.map((column) => columnLabels[column] ?? column)))
      table.rows.forEach((row) => lines.push(csvLine(table.columns.map((column) => formatResultValue(row[column] ?? '', column)))))
    })
    if (selectedIds.includes('stata')) {
      lines.push('', 'Stata 风格回归表', ...buildStataRows().map((row) => csvLine(row)))
    }
    if (selectedIds.includes('three-line')) {
      if (lines.length > 0) lines.push('')
      const publicationRows = buildPublicationRegressionRows()
      const note = String(publicationRows.at(-1)?.[0] ?? '')
      lines.push(...publicationRows.slice(0, -1).map((row) => csvLine(row)), '', note)
    }
    if (selectedIds.includes('custom-publication')) {
      const publicationTable = buildCustomPublicationTableFromConfig()
      if (publicationTable) {
        if (lines.length > 0) lines.push('')
        const publicationRows = publicationTableToRows(publicationTable, { includeNotes: true })
        const note = String(publicationRows.at(-1)?.[0] ?? '')
        lines.push(...publicationRows.slice(0, -1).map((row) => csvLine(row)), '', note)
      }
    }
    if (selectedIds.includes('logs')) {
      lines.push('', '运行日志', csvLine(['Level', 'Message']), ...runLogs.map((entry) => csvLine([entry.level, entry.message])))
    }
    if (selectedIds.includes('config')) {
      lines.push('', '参数配置 JSON', csvLine(['JSON']), csvLine([JSON.stringify(sanitizedConfig, null, 2)]))
    }
    return lines.join('\n')
  }

  const exportReport = async (format: ExportFormat = exportFormat, selectedIds = getExportSelection()) => {
    if (!result || !hasActiveModel) return
    if (selectedIds.length === 0) return
    if (format === 'excel') {
      downloadBlob([await buildExcelBlob(selectedIds)], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${activeModel.id}-report.xlsx`)
      return
    }
    if (format === 'html') {
      downloadBlob([buildHtmlReport(selectedIds)], 'text/html;charset=utf-8', `${activeModel.id}-report.html`)
      return
    }
    if (format === 'word') {
      downloadBlob(['\uFEFF', buildHtmlReport(selectedIds)], 'application/msword;charset=utf-8', `${activeModel.id}-report.doc`)
      return
    }
    if (format === 'json') {
      downloadBlob(
        [
          JSON.stringify(
            {
              modelId: activeModel.id,
              formula: activeModel.getFormula(sanitizedConfig),
              selected: selectedIds,
              config: selectedIds.includes('config') ? sanitizedConfig : undefined,
              summary: selectedIds.includes('summary') ? result.summary : undefined,
              tables: getSelectedResultTables(selectedIds),
              customPublication: selectedIds.includes('custom-publication') ? buildCustomPublicationTableFromConfig() : undefined,
              logs: selectedIds.includes('logs') ? runLogs : undefined,
            },
            null,
            2,
          ),
        ],
        'application/json;charset=utf-8',
        `${activeModel.id}-export.json`,
      )
      return
    }
    downloadBlob(['\uFEFF', buildCsvReport(selectedIds)], 'text/csv;charset=utf-8', activeModel.downloadName)
  }

  const openExportDialog = () => {
    if (!result) return
    const ids = exportItems.map((item) => item.id)
    setExportError('')
    setIsExporting(false)
    setSelectedExportItemIds((current) => {
      const retained = current.filter((id) => ids.includes(id))
      return retained.length > 0 ? retained : ids
    })
    setIsExportModalOpen(true)
  }

  const toggleExportItem = (id: string) => {
    setExportError('')
    setSelectedExportItemIds((current) => {
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
      return next
    })
  }

  const selectAllExportItems = () => {
    setExportError('')
    setSelectedExportItemIds(exportItems.map((item) => item.id))
  }

  const clearExportItems = () => {
    setExportError('')
    setSelectedExportItemIds([])
  }

  const selectOnlyExportItem = (id: string) => {
    setExportError('')
    setSelectedExportItemIds([id])
  }

  const selectCoreExportItems = () => {
    const coreIds = exportItems
      .filter((item) => item.id === 'summary' || item.id === 'table:coefficients' || item.id === 'stata' || item.id === 'three-line')
      .map((item) => item.id)
    setExportError('')
    setSelectedExportItemIds(coreIds.length > 0 ? coreIds : exportItems.map((item) => item.id))
  }

  const submitExport = async () => {
    if (selectedExportItemIds.length === 0 || isExporting) return
    if (selectedExportItemIds.includes('custom-publication') && effectiveCustomPublicationSourceIds.length === 0) {
      setExportError('自定义论文表至少需要选择一个结果源。')
      return
    }

    try {
      setIsExporting(true)
      setExportError('')
      await exportReport(exportFormat, selectedExportItemIds)
      setIsExportModalOpen(false)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败，请调整导出内容后重试。')
    } finally {
      setIsExporting(false)
    }
  }

  const exportCustomPublicationOnly = async (format: ExportFormat = 'excel') => {
    if (isExporting) return
    const publicationTable = buildCustomPublicationTableFromConfig()
    if (!publicationTable) {
      setExportError('自定义论文表至少需要选择一个包含回归结果的来源。')
      return
    }

    try {
      setIsExporting(true)
      setExportError('')
      const filenameBase = (customPublicationConfig.title.trim() || '自定义论文表').replace(/[\\/:*?"<>|]/g, '-')
      const rowsForExport = publicationTableToRows(publicationTable, { includeNotes: true })

      if (format === 'excel') {
        const columnCount = publicationTable.columns.length + 1
        const labelWidth = Math.min(26, Math.max(16, Math.max(...publicationTable.rows.map((row) => row.label.length), 8) * 1.35))
        const valueWidth = Math.min(
          18,
          Math.max(
            11,
            ...publicationTable.rows.flatMap((row) => row.values.map((value) => String(value ?? '').length * 1.08)),
          ),
        )
        const blob = await writeXlsxFile(
          [
            {
              sheet: publicationTable.sheetName,
              data: publicationSheetData(publicationTable),
              columns: Array.from({ length: columnCount }, (_, columnIndex) => ({ width: columnIndex === 0 ? labelWidth : valueWidth })),
              showGridLines: false,
            },
          ],
          { fontFamily: 'Times New Roman', fontSize: 11 },
        ).toBlob()
        downloadBlob([blob], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${filenameBase}.xlsx`)
        return
      }

      if (format === 'html' || format === 'word') {
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:"Times New Roman","Noto Serif SC",serif;color:#000;margin:28px;line-height:1.45}${publicationTableCss}</style></head><body>${buildPublicationTableHtml(publicationTable)}</body></html>`
        downloadBlob([format === 'word' ? '\uFEFF' : '', html], format === 'word' ? 'application/msword;charset=utf-8' : 'text/html;charset=utf-8', `${filenameBase}.${format === 'word' ? 'doc' : 'html'}`)
        return
      }

      if (format === 'json') {
        downloadBlob([JSON.stringify(publicationTable, null, 2)], 'application/json;charset=utf-8', `${filenameBase}.json`)
        return
      }

      const note = String(rowsForExport.at(-1)?.[0] ?? '')
      const csv = [...rowsForExport.slice(0, -1).map((row) => csvLine(row)), '', note].join('\n')
      downloadBlob(['\uFEFF', csv], 'text/csv;charset=utf-8', `${filenameBase}.csv`)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '自定义论文表导出失败。')
    } finally {
      setIsExporting(false)
    }
  }

  const renderParameterField = (field: ParameterField) => {
    if (field.kind === 'file') {
      const weights = asSpatialWeightsParam(sanitizedConfig.params?.[field.id])

      return (
        <div className="control-group" key={field.id}>
          <span>{field.label}</span>
          <label className="secondary-button is-full parameter-file-button">
            <Upload size={14} />
            {weights ? '更换权重文件' : '上传权重文件'}
            <input
              type="file"
              accept={field.accept ?? '.csv,.txt'}
              disabled={isModelRunning}
              onChange={(event) => {
                void importSpatialWeights(field.id, event.target.files?.[0])
                event.currentTarget.value = ''
              }}
            />
          </label>
          {weights ? (
            <div className="file-param-summary">
              <strong>{weights.fileName}</strong>
              <span>{weights.summary}</span>
              <button className="snapshot-icon-button" type="button" title="移除权重文件" onClick={() => setParamValue(field.id, '')} disabled={isModelRunning}>
                <X size={13} />
              </button>
            </div>
          ) : null}
          {field.helperText ? <small className="model-description">{field.helperText}</small> : null}
        </div>
      )
    }

    if (field.kind === 'number') {
      return (
        <label className="control-group" key={field.id}>
          <span>{field.label}</span>
          <input
            className="number-input"
            type="number"
            value={Number(asParamString(sanitizedConfig.params?.[field.id]) || field.defaultValue || 0)}
            disabled={isModelRunning}
            onChange={(event) => setParamNumber(field.id, Number(event.target.value))}
          />
          {field.helperText ? <small className="model-description">{field.helperText}</small> : null}
        </label>
      )
    }

    const options =
      field.role === 'target'
        ? numericColumns
        : field.columnTypes
          ? field.columnTypes.flatMap((type) => schemaColumnsByType[type] ?? []).filter((column) => eligibleFeatureColumns.includes(column))
          : eligibleFeatureColumns
    const coreFeatureValues = asParamArray(sanitizedConfig.params?.features)
    const controlValues = asParamArray(sanitizedConfig.params?.controls)
    const uniqueOptions = Array.from(new Set(options)).filter((column) => {
      if (field.role === 'target') return true
      if (column === selectedTarget) return false
      if (field.id === 'controls') return !coreFeatureValues.includes(column)
      if (field.kind === 'columns') return !controlValues.includes(column)
      return true
    })

    if (field.kind === 'column') {
      return (
        <label className="control-group" key={field.id}>
          <span>{field.label}</span>
          <select
            value={asParamString(sanitizedConfig.params?.[field.id])}
            disabled={isModelRunning}
            onChange={(event) => setSchemaParamColumn(field, event.target.value)}
          >
            <option value="">请选择字段</option>
            {uniqueOptions.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
          {field.helperText ? <small className="model-description">{field.helperText}</small> : null}
        </label>
      )
    }

    const selectedValues = asParamArray(sanitizedConfig.params?.[field.id])

    return (
      <div className="control-group" key={field.id}>
        <span>{field.label}</span>
        <div className="feature-picker">
          {uniqueOptions.length === 0 ? (
            <div className="empty-history">没有可选字段。</div>
          ) : (
            uniqueOptions.map((column) => (
              <label key={column}>
                <input
                  type="checkbox"
                  checked={selectedValues.includes(column)}
                  disabled={isModelRunning}
                  onChange={() => toggleParamColumn(field.id, column, field.maxSelections)}
                />
                <span>{column}</span>
              </label>
            ))
          )}
        </div>
        {field.helperText ? <small className="model-description">{field.helperText}</small> : null}
      </div>
    )
  }

  const renderPrimaryModelControls = () => (
    <>
      {activeModel.parameterSchema ? (
        <div className="parameter-schema variable-step-schema">
          {(() => {
            const fieldSection = primaryParameterSections.find((section) => section.id === 'fields')
            const targetFields = fieldSection?.fields.filter((field) => field.role === 'target') ?? []
            const coreFields = fieldSection?.fields.filter((field) => field.role !== 'target' && field.id !== 'controls') ?? []
            const controlFields = fieldSection?.fields.filter((field) => field.id === 'controls') ?? []
            const otherSections = primaryParameterSections.filter((section) => section.id !== 'fields')

            return (
              <>
                {targetFields.length > 0 ? (
                  <section className="parameter-section variable-step-section">
                    <div className="parameter-section__header">
                      <strong>Step 1 · 选择被解释变量</strong>
                      <span>先确定因变量 Y；切换后会自动移除同名解释变量。</span>
                    </div>
                    {targetFields.map(renderParameterField)}
                  </section>
                ) : null}

                {coreFields.length > 0 ? (
                  <section className="parameter-section variable-step-section">
                    <div className="parameter-section__header">
                      <strong>Step 2 · 选择核心解释变量</strong>
                      <span>核心解释变量会进入主公式；已选控制变量不会在这里重复出现。</span>
                    </div>
                    {coreFields.map(renderParameterField)}
                  </section>
                ) : null}

                {controlFields.length > 0 ? (
                  <section className="parameter-section variable-step-section">
                    <div className="parameter-section__header">
                      <strong>Step 3 · 选择控制变量</strong>
                      <span>控制变量与核心解释变量互斥，但运行时仍会纳入回归。</span>
                    </div>
                    {controlFields.map(renderParameterField)}
                  </section>
                ) : null}

                {otherSections.map((section) => (
                  <section className="parameter-section" key={section.id}>
                    <div className="parameter-section__header">
                      <strong>{section.title}</strong>
                      <span>{section.description}</span>
                    </div>
                    {section.fields.map(renderParameterField)}
                  </section>
                ))}
              </>
            )
          })()}
        </div>
      ) : activeModel.requiresTarget ? (
        <section className="parameter-section">
          <div className="parameter-section__header">
            <strong>模型字段</strong>
            <span>选择因变量和解释变量。</span>
          </div>
          <label className="control-group">
            <span>{activeModel.targetLabel}</span>
            <select
              value={selectedTarget}
              disabled={isModelRunning}
              onChange={(event) => setModelConfig((current) => ({ ...current, target: event.target.value }))}
            >
              <option value="">请选择字段</option>
              {numericColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {!activeModel.parameterSchema ? (
        <section className={`parameter-section ${activeModel.requiresTarget ? 'is-continuation' : ''}`}>
          {!activeModel.requiresTarget ? (
            <div className="parameter-section__header">
              <strong>模型字段</strong>
              <span>选择当前方法需要分析的数据列。</span>
            </div>
          ) : null}
          <div className="control-group">
            <span>{activeModel.featuresLabel}</span>
            <div className="feature-picker">
              {selectableFeatureColumns.length === 0 ? (
                <div className="empty-history">当前插件没有可用字段，请在数据表中调整字段类型或维度角色。</div>
              ) : (
                selectableFeatureColumns.map((column) => {
                  const profile = profiles.find((entry) => entry.name === column)

                  return (
                    <label key={column}>
                      <input
                        type="checkbox"
                        checked={selectedFeatures.includes(column)}
                        disabled={isModelRunning}
                        onChange={() => toggleFeature(column)}
                      />
                      <span>
                        {column}
                        {profile?.type === 'category' ? <em>{activeModel.supportsCategoricalFeatures ? 'encoded' : 'category'}</em> : null}
                        {profile?.type === 'text' ? <em>text</em> : null}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )

  const renderModelRunSettings = () => (
    <>
      {activeModel.parameterSchema && advancedSchemaSections.length > 0 ? (
        <div className="parameter-schema">
          {advancedSchemaSections.map((section) => (
            <section className="parameter-section" key={section.id}>
              <div className="parameter-section__header">
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </div>
              {section.fields.map(renderParameterField)}
            </section>
          ))}
        </div>
      ) : null}

      {activeModel.supportsInference ? (
        <section className="parameter-section">
          <div className="parameter-section__header">
            <strong>推断设置</strong>
            <span>设置标准误类型和聚类字段。</span>
          </div>
          <div className="inference-controls">
            <label className="control-group">
              <span>标准误</span>
              <select
                value={inferenceConfig.standardError}
                disabled={isModelRunning}
                onChange={(event) =>
                  setInferenceConfig((current) => ({
                    ...current,
                    standardError: event.target.value as InferenceConfig['standardError'],
                  }))
                }
              >
                <option value="ols">普通标准误</option>
                <option value="robust">Robust 稳健标准误</option>
                <option value="cluster">Cluster 聚类稳健标准误</option>
              </select>
            </label>

            {inferenceConfig.standardError === 'cluster' ? (
              <label className="control-group">
                <span>Cluster 字段</span>
                <select
                  value={effectiveInference.clusterField}
                  disabled={isModelRunning}
                  onChange={(event) =>
                    setInferenceConfig((current) => ({
                      ...current,
                      clusterField: event.target.value,
                    }))
                  }
                >
                  {clusterColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
                <small className="model-description">优先使用导入向导中的 ID/Time/Group 字段。</small>
              </label>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="settings-list">
        {activeModel.getSettings(sanitizedConfig).map((setting) => (
          <div key={setting.label}>
            <span>{setting.label}</span>
            <strong>{setting.value}</strong>
          </div>
        ))}
      </div>

      <div className="formula-box">
        <span>Formula</span>
        <code>{activeModel.getFormula(sanitizedConfig)}</code>
      </div>
    </>
  )

  const renderValidationPanel = () =>
    validationIssues.length > 0 ? (
      <div className="parameter-validation">
        <strong>运行前检查</strong>
        {validationIssues.map((issue) => (
          <p className={issue.level === 'error' ? 'is-error' : 'is-warning'} key={issue.message}>
            <AlertTriangle size={13} />
            {issue.message}
          </p>
        ))}
      </div>
    ) : (
      <div className="parameter-validation is-ok">
        <strong>运行前检查</strong>
        <p>
          <CheckCircle size={13} />
          当前参数可以运行。
        </p>
      </div>
    )

  const workflowItems: Array<{ id: WorkflowStep; label: string }> = [
    { id: 'model', label: '选模型' },
    { id: 'upload', label: '上传数据' },
    { id: 'roles', label: 'ID / 分组' },
    { id: 'variables', label: '变量设定' },
    { id: 'run', label: '运行' },
    { id: 'results', label: '结果' },
  ]

  const renderWorkflowGuidance = () => (
    <section className={`guided-workflow is-${effectiveWorkflowStep}`}>
      <div className="guided-workflow__rail" aria-label="建模流程">
        {workflowItems.map((item, index) => (
          <button
            key={item.id}
            className={item.id === effectiveWorkflowStep ? 'is-active' : ''}
            type="button"
            onClick={() => {
              if (item.id !== 'model' && !hasActiveModel) return
              if (item.id === 'results' && !result) return
              if ((item.id === 'roles' || item.id === 'variables' || item.id === 'run') && !hasDataset) return
              if (item.id === 'run' && (!isModelRunning || validationErrors.length > 0)) return
              if (item.id === 'variables') {
                openVariableSetup()
                return
              }
              setWorkflowStep(item.id)
            }}
            disabled={(item.id !== 'model' && !hasActiveModel) || (item.id === 'results' && !result) || ((item.id === 'roles' || item.id === 'variables' || item.id === 'run') && !hasDataset) || (item.id === 'run' && !isModelRunning)}
          >
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>

      {effectiveWorkflowStep === 'model' ? (
        <div className="guided-workflow__body">
          <div>
            <span className="panel__label">Step 1</span>
            <h3>{hasActiveModel ? '模型已选择' : '请选择一个模型开始分析'}</h3>
            <p>{hasActiveModel ? `已选择 ${activeModel.name}。如需更换，请先在模型库中点选模型，再点击“使用此模型”完成应用。` : '打开模型库，点选一个模型后点击“使用此模型”，主页会显示当前已选模型。'}</p>
          </div>
          <div className="guided-workflow__actions">
            <button className="secondary-button" type="button" onClick={openModelLibrary} disabled={isModelRunning}>
              <Search size={14} />
              打开模型库
            </button>
            <button className="primary-button" type="button" onClick={() => setWorkflowStep('upload')} disabled={!hasActiveModel || isModelRunning}>
              确认模型，继续上传
            </button>
          </div>
        </div>
      ) : null}

      {effectiveWorkflowStep === 'upload' ? (
        <div className="guided-workflow__body">
          <div>
            <span className="panel__label">Step 2</span>
            <h3>上传 CSV 或 XLSX 数据</h3>
            <p>{hasDataset ? `已导入 ${fileName || '当前数据'}，共 ${rows.length} 行。可以重新上传，或继续设置 ID 字段。` : '导入数据后，系统会打开字段角色确认面板。'}</p>
          </div>
          <div className="guided-workflow__actions">
            <label className="primary-button import-cta">
              <Upload size={15} />
              {hasDataset ? '重新上传' : '选择文件'}
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={!canImportData}
                onChange={(event) => {
                  handleUpload(event.target.files?.[0])
                  event.currentTarget.value = ''
                }}
              />
            </label>
            {hasDataset ? (
              <button className="secondary-button" type="button" onClick={() => setWorkflowStep('roles')}>
                继续设置 ID / 分组
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {effectiveWorkflowStep === 'roles' ? (
        <div className="guided-workflow__body">
          <div>
            <span className="panel__label">Step 3</span>
            <h3>确认 ID、时间和分组字段</h3>
            <p>{hasRoleSetting ? roleSummary : '如果数据没有 ID、时间或分组字段，可以直接继续变量设定。'}</p>
          </div>
          <div className="guided-role-grid">
            {profiles.map((profile) => (
              <label key={profile.name} className="guided-role-row">
                <span>
                  <strong>{profile.name}</strong>
                  <small>{profile.type} · {profile.missing} miss · {profile.unique} unique</small>
                </span>
                <select className="role-select" value={fieldRoleValue(dataRoles, profile.name)} onChange={(event) => setDataFieldRole(profile.name, event.target.value)} disabled={isModelRunning}>
                  <option value="">模型变量</option>
                  <option value="id">ID</option>
                  <option value="time">Time</option>
                  <option value="group">Group</option>
                </select>
              </label>
            ))}
          </div>
          <div className="guided-workflow__actions">
            <button className="primary-button" type="button" onClick={openVariableSetup} disabled={!hasActiveModel || !hasDataset || isModelRunning}>
              打开变量设定
            </button>
          </div>
        </div>
      ) : null}

      {effectiveWorkflowStep === 'variables' ? (
        <div className="guided-workflow__body">
          <div>
            <span className="panel__label">Step 4</span>
            <h3>设置因变量、自变量和控制变量</h3>
            <p>{modelContextLead}</p>
          </div>
          <div className="variable-summary-card">
            <div>
              <span>{activeModel.targetLabel}</span>
              <strong>{selectedTarget || '未设置'}</strong>
            </div>
            <div>
              <span>{activeModel.featuresLabel}</span>
              <strong>{selectedFeatureSummary}</strong>
            </div>
            <div>
              <span>运行前检查</span>
              <strong>{validationErrors.length > 0 ? validationErrors[0].message : '当前参数可以运行'}</strong>
            </div>
          </div>
          <div className="guided-workflow__actions">
            <button className="primary-button" type="button" onClick={openVariableSetup} disabled={!hasActiveModel || !hasDataset || isModelRunning}>
              设置变量与参数
            </button>
            <button className="secondary-button" type="button" onClick={handleRunModel} disabled={!hasActiveModel || !hasDataset || isModelRunning || validationErrors.length > 0}>
              <Play size={14} />
              {validationErrors.length > 0 ? '需调整后运行' : '运行模型'}
            </button>
          </div>
        </div>
      ) : null}

      {effectiveWorkflowStep === 'run' && isModelRunning ? (
        <div className="guided-workflow__body">
          <div>
            <span className="panel__label">Step 5</span>
            <h3>模型正在运行</h3>
            <p>{runTask?.phase || '参数已锁定，完成后自动进入结果阅读。'}</p>
          </div>
          {runTask ? (
            <div className="run-task-progress" aria-label="模型运行进度">
              <div>
                <span>{runTask.progress}%</span>
                <span>
                  {formatDuration(runTask.elapsedMs)} / {formatDuration(runTask.estimatedMs)}
                </span>
              </div>
              <progress value={runTask.progress} max={100} />
            </div>
          ) : null}
        </div>
      ) : null}

      {effectiveWorkflowStep === 'results' ? (
        <div className="guided-workflow__body">
          <div>
            <span className="panel__label">Step 6</span>
            <h3>按结果阅读顺序检查输出</h3>
            <p>中间区域从上往下是系数估计、核心结论和稳定性检验。需要修改参数时，回到变量设定后重新运行。</p>
          </div>
          <div className="guided-workflow__actions">
            <button className="secondary-button" type="button" onClick={openVariableSetup} disabled={isModelRunning}>
              返回变量设定
            </button>
            <button className="secondary-button is-subtle" type="button" onClick={openExportDialog} disabled={!result}>
              <Download size={14} />
              导出结果
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )

  const renderVariableSetupModal = () => (
    <div className="modal-backdrop" role="presentation">
      <section className="import-wizard variable-setup-modal" role="dialog" aria-modal="true" aria-label="变量设定向导">
        <div className="data-modal__header">
          <div>
            <span className="panel__label">Variable setup</span>
            <h2>设置变量与参数</h2>
            <p>{activeModel.name} · {activeFormula}</p>
          </div>
          <button className="ghost-button" type="button" onClick={saveVariableSetup} title="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="modal-summary-strip">
          <div>
            <span>模型</span>
            <strong>{activeModel.name}</strong>
          </div>
          <div>
            <span>样本</span>
            <strong>{hasDataset ? `${rows.length} 行 · ${profiles.length} 字段` : '尚未导入数据'}</strong>
          </div>
          <div>
            <span>检查</span>
            <strong>{validationErrors.length > 0 ? validationErrors[0].message : '当前参数可以运行'}</strong>
          </div>
        </div>

        <div className="variable-setup__body">
          <section className="variable-setup-pane">
            <div className="section-title">
              <Table size={17} />
              <h2>字段设定</h2>
            </div>
            <p>选择因变量、核心自变量和控制变量。维度字段不会进入候选列表。</p>
            {renderPrimaryModelControls()}
          </section>

          <section className="variable-setup-pane">
            <div className="section-title">
              <SlidersHorizontal size={17} />
              <h2>参数与推断</h2>
            </div>
            <p>设置标准误、聚类字段和模型特有的高级参数。</p>
            {renderModelRunSettings()}
          </section>

          <section className="variable-setup-pane">
            <div className="section-title">
              <CheckCircle size={17} />
              <h2>运行前检查</h2>
            </div>
            <p>保存前确认字段、样本和参数是否满足当前模型要求。</p>
            {renderValidationPanel()}
            <div className="variable-summary-card">
              <div>
                <span>{activeModel.targetLabel}</span>
                <strong>{selectedTarget || '未设置'}</strong>
              </div>
              <div>
                <span>{activeModel.featuresLabel}</span>
                <strong>{selectedFeatureSummary}</strong>
              </div>
              <div>
                <span>维度字段</span>
                <strong>{roleSummary || '未设置'}</strong>
              </div>
            </div>
          </section>
        </div>

        <div className="import-wizard__footer">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setWorkflowStep('roles')
              setIsVariableSetupOpen(false)
            }}
          >
            返回 ID / 分组
          </button>
          <button className="secondary-button is-subtle" type="button" onClick={saveVariableSetup}>
            保存设定
          </button>
          <button className="primary-button" type="button" onClick={saveVariableSetupAndRun} disabled={!hasActiveModel || !hasDataset || isModelRunning || validationErrors.length > 0}>
            <Play size={14} />
            保存并运行
          </button>
        </div>
      </section>
    </div>
  )

  const visiblePublicationVariableCount = orderedCustomPublicationVariableOptions.filter((option) => !hiddenCustomPublicationVariableSet.has(option.id)).length
  const enabledPublicationStatisticCount = customPublicationStatisticOptions.filter((option) => !disabledCustomPublicationStatisticSet.has(option.id)).length
  const customPublicationDisplayTitle = customPublicationPreviewTable?.title ?? customPublicationConfig.title
  const publicationTemplateStatus = matchedCustomPublicationTemplate
    ? `当前使用模板：${matchedCustomPublicationTemplate.name}`
    : isCustomPublicationDefaultTableMode
      ? '默认同款：当前结果论文三线表'
      : customPublicationDefaultTemplateId
      ? '当前为草稿状态，可随时应用默认模板'
      : '当前为未命名草稿'

  const renderCustomPublicationWorkbench = () => (
    <section className="publication-workbench">
      <div className="publication-workbench__editor">
        <section className="publication-workbench__hero">
          <div>
            <span className="panel__label">Paper Table Workspace</span>
            <h2>{customPublicationDisplayTitle}</h2>
            <p>把来源列、变量行、统计行和注释整理成一张适合 Excel、Word 和 HTML 导出的论文表。</p>
          </div>
          <div className="publication-workbench__hero-actions">
            <button className="secondary-button is-subtle" type="button" onClick={closePublicationWorkbench}>
              返回建模
            </button>
            <button className="primary-button" type="button" onClick={() => exportCustomPublicationOnly('excel')} disabled={!canExportCustomPublication}>
              <Download size={14} />
              {isExporting ? '导出中' : '导出自定义表'}
            </button>
          </div>
        </section>

        <div className="publication-workbench__meta">
          <span>{selectedPublicationSources.length} 个来源列</span>
          <span>{visiblePublicationVariableCount} 个显示变量</span>
          <span>{enabledPublicationStatisticCount} 个统计行</span>
          {isCustomPublicationDefaultTableMode ? <span>与直接论文三线表一致</span> : null}
          <span>{publicationTemplateStatus}</span>
        </div>

        {isCustomPublicationDefaultTableMode ? (
          <div className="custom-publication-mode-notice">
            <div>
              <strong>当前使用“当前结果论文三线表”模式</strong>
              <span>预览和导出会复用直接导出的论文三线表。添加历史来源、修改列头或调整格式后，将进入自定义多列表模式。</span>
            </div>
            <button className="secondary-button" type="button" onClick={startCustomPublicationEditing} disabled={isExporting}>
              开始自定义多列表
            </button>
          </div>
        ) : null}

        {exportError && workspaceTab === 'publication' ? (
          <div className="export-error" role="alert">
            <AlertTriangle size={15} />
            {exportError}
          </div>
        ) : null}

        <div className="custom-publication-panel custom-publication-panel--workspace">
          <div className="custom-publication-toolbar">
            <div className="custom-publication-toolbar__group">
              <button className="secondary-button" type="button" onClick={resetCustomPublicationOrdering} disabled={isExporting}>
                恢复默认顺序
              </button>
              <button className="secondary-button" type="button" onClick={restoreCustomPublicationDefaults} disabled={isExporting}>
                恢复默认规则
              </button>
              <button className="secondary-button" type="button" onClick={saveCustomPublicationTemplate} disabled={isExporting}>
                保存模板
              </button>
              <button className="secondary-button" type="button" onClick={applyDefaultCustomPublicationTemplate} disabled={isExporting || !customPublicationDefaultTemplateId}>
                应用默认模板
              </button>
            </div>
          </div>

          <div className="custom-publication-fields">
            <label>
              <span>表名</span>
              <input value={customPublicationConfig.title} disabled={isExporting} onChange={(event) => updateCustomPublicationConfig({ title: event.target.value })} />
            </label>
            <label>
              <span>注释</span>
              <textarea value={customPublicationConfig.note} disabled={isExporting} rows={3} onChange={(event) => updateCustomPublicationConfig({ note: event.target.value })} />
            </label>
          </div>

          <div className="custom-publication-settings-grid">
            <section className="custom-publication-editor">
              <div className="custom-publication-editor__header">
                <strong>列与多级表头</strong>
                <span>选择当前结果和历史结果作为列来源，并设置一级分组、列名与模型行。</span>
              </div>
              <div className="custom-publication-source-list custom-publication-source-list--workspace">
                {publicationSources.length === 0 ? (
                  <div className="empty-history">暂无可用结果。运行模型或保存带结果的历史记录后可联合导出。</div>
                ) : (
                  [...selectedPublicationSources, ...publicationSources.filter((source) => !customPublicationSelectedSet.has(source.id))].map((source, sourceIndex) => {
                    const draft = customPublicationConfig.columns[source.id] ?? {
                      id: source.id,
                      label: `(${sourceIndex + 1})`,
                      group: '',
                      modelLabel: source.modelShortName || source.modelName,
                    }
                    const selectedIndex = selectedPublicationSources.findIndex((entry) => entry.id === source.id)
                    return (
                      <div
                        className={`custom-publication-source ${customPublicationSelectedSet.has(source.id) ? 'is-selected' : ''}`}
                        key={source.id}
                        draggable={customPublicationSelectedSet.has(source.id)}
                        onDragStart={() => setDraggingPublicationItem({ kind: 'column', id: source.id })}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => reorderCustomPublicationByDrop('column', source.id)}
                        onDragEnd={() => setDraggingPublicationItem(null)}
                      >
                        <label className="custom-publication-source__check">
                          <input type="checkbox" checked={customPublicationSelectedSet.has(source.id)} disabled={isExporting} onChange={() => toggleCustomPublicationSource(source.id)} />
                          <span>
                            <strong>{source.label}</strong>
                            <small>{source.formula}</small>
                          </span>
                        </label>
                        <div className="custom-publication-source__fields">
                          <input value={draft.group} placeholder="一级表头分组" disabled={isExporting || !customPublicationSelectedSet.has(source.id)} onChange={(event) => updateCustomPublicationColumn(source.id, { group: event.target.value })} />
                          <input value={draft.label} placeholder="列名，如 (1)" disabled={isExporting || !customPublicationSelectedSet.has(source.id)} onChange={(event) => updateCustomPublicationColumn(source.id, { label: event.target.value })} />
                          <input value={draft.modelLabel} placeholder="模型行，如 Fe" disabled={isExporting || !customPublicationSelectedSet.has(source.id)} onChange={(event) => updateCustomPublicationColumn(source.id, { modelLabel: event.target.value })} />
                        </div>
                        {customPublicationSelectedSet.has(source.id) ? (
                          <div className="custom-publication-source__actions">
                            <button className="secondary-button" type="button" disabled={isExporting || selectedIndex <= 0} onClick={() => moveCustomPublicationColumn(source.id, 'up')}>
                              上移
                            </button>
                            <button className="secondary-button" type="button" disabled={isExporting || selectedIndex === -1 || selectedIndex >= selectedPublicationSources.length - 1} onClick={() => moveCustomPublicationColumn(source.id, 'down')}>
                              下移
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <section className="custom-publication-editor">
              <div className="custom-publication-editor__header">
                <strong>显示规则</strong>
                <span>控制数字位数、括号统计、星号阈值以及缺失/布尔展示方式。</span>
              </div>
              <div className="custom-publication-style-card">
                <span>表格样式</span>
                <strong>论文三线表 / Stata 风格</strong>
                <small>预览、Excel、Word 和 HTML 使用同一套黑白三线表规则；不输出编辑器里的绿色提示角或换行标记。</small>
              </div>
              <div className="custom-publication-format-grid">
                <label><span>系数小数位</span><input type="number" min="0" max="8" value={customPublicationConfig.formatRules.coefficientDigits} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ coefficientDigits: Number(event.target.value) })} /></label>
                <label><span>括号统计小数位</span><input type="number" min="0" max="8" value={customPublicationConfig.formatRules.statisticDigits} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ statisticDigits: Number(event.target.value) })} /></label>
                <label><span>N 小数位</span><input type="number" min="0" max="4" value={customPublicationConfig.formatRules.nDigits} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ nDigits: Number(event.target.value) })} /></label>
                <label><span>Adj-R² 小数位</span><input type="number" min="0" max="6" value={customPublicationConfig.formatRules.r2Digits} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ r2Digits: Number(event.target.value) })} /></label>
                <label>
                  <span>括号统计</span>
                  <select value={customPublicationConfig.formatRules.parenthesisMode} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ parenthesisMode: event.target.value as CustomPublicationFormatRules['parenthesisMode'] })}>
                    <option value="t">t 值</option>
                    <option value="z">z 值</option>
                    <option value="stdError">标准误</option>
                  </select>
                </label>
                <label>
                  <span>缺失显示</span>
                  <select value={customPublicationConfig.formatRules.missingDisplay} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ missingDisplay: event.target.value as CustomPublicationFormatRules['missingDisplay'] })}>
                    <option value="">空白</option>
                    <option value="-">-</option>
                    <option value="/">/</option>
                  </select>
                </label>
                <label>
                  <span>布尔显示</span>
                  <select value={customPublicationConfig.formatRules.booleanDisplay} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ booleanDisplay: event.target.value as CustomPublicationFormatRules['booleanDisplay'] })}>
                    <option value="yes-no">Yes / No</option>
                    <option value="yes-blank">Yes / 空白</option>
                    <option value="check">勾选语义</option>
                  </select>
                </label>
                <label><span>* 阈值</span><input type="number" step="0.001" min="0" max="1" value={customPublicationConfig.formatRules.starLevels.one} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ starLevels: { ...customPublicationConfig.formatRules.starLevels, one: Number(event.target.value) } })} /></label>
                <label><span>** 阈值</span><input type="number" step="0.001" min="0" max="1" value={customPublicationConfig.formatRules.starLevels.two} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ starLevels: { ...customPublicationConfig.formatRules.starLevels, two: Number(event.target.value) } })} /></label>
                <label><span>*** 阈值</span><input type="number" step="0.001" min="0" max="1" value={customPublicationConfig.formatRules.starLevels.three} disabled={isExporting} onChange={(event) => updateCustomPublicationFormatRules({ starLevels: { ...customPublicationConfig.formatRules.starLevels, three: Number(event.target.value) } })} /></label>
              </div>
            </section>
          </div>

          <div className="custom-publication-editor-grid">
            <section className="custom-publication-editor">
              <div className="custom-publication-editor__header">
                <strong>变量行</strong>
                <span>勾选显示项，支持重命名、按钮排序和拖拽排序。</span>
              </div>
              <div className="custom-publication-editor__toolbar">
                <button className="secondary-button" type="button" onClick={() => setAllCustomPublicationVariables(true)} disabled={isExporting}>全选</button>
                <button className="secondary-button" type="button" onClick={() => setAllCustomPublicationVariables(false)} disabled={isExporting}>全不选</button>
              </div>
              <div className="custom-publication-row-list custom-publication-row-list--workspace">
                {orderedCustomPublicationVariableOptions.length === 0 ? (
                  <div className="empty-history">先选择至少一个包含回归结果的来源列。</div>
                ) : (
                  orderedCustomPublicationVariableOptions.map((option, index) => {
                    const isVisible = !hiddenCustomPublicationVariableSet.has(option.id)
                    return (
                      <div className={`custom-publication-row ${isVisible ? 'is-selected' : ''}`} key={option.id} draggable onDragStart={() => setDraggingPublicationItem({ kind: 'variable', id: option.id })} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderCustomPublicationByDrop('variable', option.id)} onDragEnd={() => setDraggingPublicationItem(null)}>
                        <label className="custom-publication-row__check">
                          <input type="checkbox" checked={isVisible} disabled={isExporting} onChange={() => toggleCustomPublicationVariable(option.id)} />
                          <span><strong>{option.label}</strong><small>{option.id}</small></span>
                        </label>
                        <input className="custom-publication-row__rename" value={customPublicationConfig.variableLabels[option.id] ?? option.label} disabled={isExporting} onChange={(event) => updateCustomPublicationVariableLabel(option.id, event.target.value)} />
                        <div className="custom-publication-row__actions">
                          <button className="secondary-button" type="button" disabled={isExporting || index === 0} onClick={() => moveCustomPublicationVariable(option.id, 'up')}>上移</button>
                          <button className="secondary-button" type="button" disabled={isExporting || index === orderedCustomPublicationVariableOptions.length - 1} onClick={() => moveCustomPublicationVariable(option.id, 'down')}>下移</button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <section className="custom-publication-editor">
              <div className="custom-publication-editor__header">
                <strong>统计行</strong>
                <span>自由开关、重命名，并支持按钮排序和拖拽排序。</span>
              </div>
              <div className="custom-publication-editor__toolbar">
                <button className="secondary-button" type="button" onClick={() => setAllCustomPublicationStatistics(true)} disabled={isExporting}>全开</button>
                <button className="secondary-button" type="button" onClick={() => setAllCustomPublicationStatistics(false)} disabled={isExporting}>全关</button>
              </div>
              <div className="custom-publication-row-list custom-publication-row-list--workspace">
                {customPublicationStatisticOptions.length === 0 ? (
                  <div className="empty-history">选择结果列后，这里会出现可配置的统计行。</div>
                ) : (
                  customPublicationStatisticOptions.map((option, index) => {
                    const isEnabled = !disabledCustomPublicationStatisticSet.has(option.id)
                    return (
                      <div className={`custom-publication-row ${isEnabled ? 'is-selected' : ''}`} key={option.id} draggable onDragStart={() => setDraggingPublicationItem({ kind: 'statistic', id: option.id })} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderCustomPublicationByDrop('statistic', option.id)} onDragEnd={() => setDraggingPublicationItem(null)}>
                        <div className="custom-publication-row__check">
                          <input type="checkbox" checked={isEnabled} disabled={isExporting} onChange={() => toggleCustomPublicationStatistic(option.id)} />
                          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                        </div>
                        <input className="custom-publication-row__rename" value={customPublicationConfig.statisticLabels[option.id] ?? option.label} disabled={isExporting} onChange={(event) => updateCustomPublicationStatisticLabel(option.id, event.target.value)} />
                        <div className="custom-publication-row__actions">
                          <button className="secondary-button" type="button" disabled={isExporting || index === 0} onClick={() => moveCustomPublicationStatistic(option.id, 'up')}>上移</button>
                          <button className="secondary-button" type="button" disabled={isExporting || index === customPublicationStatisticOptions.length - 1} onClick={() => moveCustomPublicationStatistic(option.id, 'down')}>下移</button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>

          <div className="custom-publication-preview-grid custom-publication-preview-grid--single">
            <section className="custom-publication-editor">
              <div className="custom-publication-editor__header">
                <strong>用户模板</strong>
                <span>保存你自己的论文表格式，后续可套用、复制、删除，并设置为默认模板。</span>
              </div>
              <div className="custom-publication-template-list">
                {customPublicationTemplates.length === 0 ? (
                  <div className="empty-history">还没有保存的模板。</div>
                ) : (
                  customPublicationTemplates.map((template) => (
                    <div className={`custom-publication-template ${customPublicationDefaultTemplateId === template.id ? 'is-default' : ''}`} key={template.id}>
                      <input value={template.name} disabled={isExporting} onChange={(event) => renameCustomPublicationTemplate(template.id, event.target.value)} />
                      <small>更新于 {new Date(template.updatedAt).toLocaleString()}</small>
                      <div className="custom-publication-template__actions">
                        <button className="secondary-button" type="button" onClick={() => applyCustomPublicationTemplate(template.id)} disabled={isExporting}>应用</button>
                        <button className="secondary-button" type="button" onClick={() => duplicateCustomPublicationTemplate(template.id)} disabled={isExporting}>复制</button>
                        <button className="secondary-button" type="button" onClick={() => setCustomPublicationDefaultTemplateId(template.id)} disabled={isExporting}>{customPublicationDefaultTemplateId === template.id ? '默认中' : '设默认'}</button>
                        <button className="secondary-button is-danger" type="button" onClick={() => deleteCustomPublicationTemplate(template.id)} disabled={isExporting}>删除</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="publication-workbench__preview">
        <section className="publication-preview-card">
          <div className="publication-preview-card__header">
            <div>
              <span className="panel__label">Live preview</span>
              <h2>论文表预览</h2>
              <p>预览会实时反映列顺序、变量显示、统计行与注释内容。</p>
            </div>
            <button className="secondary-button is-subtle" type="button" onClick={() => exportCustomPublicationOnly('excel')} disabled={!canExportCustomPublication}>
              导出 Excel
            </button>
          </div>
          {customPublicationPreviewTable ? (
            <div className="publication-preview-card__body">
              <div className="custom-publication-preview__frame custom-publication-preview__frame--workspace" dangerouslySetInnerHTML={{ __html: customPublicationPreviewHtml }} />
            </div>
          ) : (
            <div className="empty-history">先选择至少一个结果列，右侧会实时生成论文表预览。</div>
          )}
        </section>
      </div>
    </section>
  )

  const renderCustomPublicationExportSummary = () => (
    <div className="custom-publication-summary-card">
      <div className="custom-publication-summary-card__header">
        <div>
          <strong>自定义论文表</strong>
          <span>复杂编辑已迁移到独立工作台，这里只保留导出摘要。</span>
        </div>
        <button className="secondary-button" type="button" onClick={openPublicationWorkbench} disabled={!result}>
          进入编辑器
        </button>
      </div>
      <div className="custom-publication-summary-card__grid">
        <div><span>当前表名</span><strong>{customPublicationDisplayTitle}</strong></div>
        <div><span>来源列</span><strong>{selectedPublicationSources.length} 个</strong></div>
        <div><span>变量行</span><strong>{visiblePublicationVariableCount} 个显示</strong></div>
        <div><span>统计行</span><strong>{enabledPublicationStatisticCount} 个启用</strong></div>
      </div>
      <p className="custom-publication-summary-card__footnote">
        {publicationTemplateStatus}
        {customPublicationDefaultTemplateId ? ' · 已设置默认模板' : ''}
      </p>
    </div>
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar__left">
          <div className="topbar__brand">
            <span className="eyebrow">Visual Stats Lab</span>
            <h1>{workspaceTab === 'publication' ? '自定义导出表' : '统计建模工作台'}</h1>
          </div>
          <nav className="workspace-tabs" aria-label="工作区切换">
            <button
              className={workspaceTab === 'workbench' ? 'is-active' : ''}
              type="button"
              onClick={() => setWorkspaceTab('workbench')}
            >
              建模工作台
            </button>
            <button
              className={workspaceTab === 'publication' ? 'is-active' : ''}
              type="button"
              onClick={openPublicationWorkbench}
            >
              自定义导出表
            </button>
          </nav>
        </div>
        <div className="topbar__actions">
          {workspaceTab === 'publication' ? (
            <>
              <button className="secondary-button is-subtle" type="button" onClick={closePublicationWorkbench}>
                返回建模
              </button>
              <button className="primary-button" type="button" onClick={() => exportCustomPublicationOnly('excel')} disabled={!canExportCustomPublication}>
                <Download size={15} />
                {isExporting ? '导出中' : '导出自定义表'}
              </button>
            </>
          ) : (
            <>
              <label
                className={`icon-button ${canImportData ? '' : 'is-disabled'}`}
                title={canImportData ? '导入 CSV / XLSX' : '请先选择模型'}
                aria-disabled={!canImportData}
                onClick={(event) => {
                  if (canImportData) return
                  event.preventDefault()
                  setWorkflowStep('model')
                }}
              >
                <Upload size={16} />
                <input
                  type="file"
                  accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={!canImportData}
                  onChange={(event) => {
                    handleUpload(event.target.files?.[0])
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              <button className="secondary-button is-subtle" type="button" onClick={() => setIsDataModalOpen(true)} disabled={!hasDataset}>
                <Table size={15} />
                数据表
              </button>
              <button className="primary-button" type="button" onClick={handleRunModel} disabled={!hasActiveModel || !hasDataset || isModelRunning || validationErrors.length > 0}>
                <Play size={15} />
                {isModelRunning ? '运行中' : '运行模型'}
              </button>
            </>
          )}
        </div>
      </header>

      <section className={`workspace workspace--${workspaceMode}`}>
        {workspaceMode !== 'publication' ? (
        <aside className="panel data-panel">
          <div className="panel__header">
            <div>
              <span className="panel__label">Project</span>
              <h2>项目索引</h2>
            </div>
          </div>

          <div className="history-panel-content">
            <div className="dataset-card dataset-card--compact">
              <span className="dataset-card__label">当前项目</span>
              <strong className="dataset-card__title">{fileName || '尚未导入数据'}</strong>
              <div className="project-summary-list">
                <div>
                  <span>数据规模</span>
                  <strong>{hasDataset ? `${rows.length} 行 · ${profiles.length} 字段` : '未导入'}</strong>
                </div>
                <div>
                  <span>当前模型</span>
                  <strong>{activeModel.name}</strong>
                </div>
                <div>
                  <span>维度字段</span>
                  <strong>{roleSummary || '未设置'}</strong>
                </div>
                <div>
                  <span>结果状态</span>
                  <strong>{result ? '已有结果' : hasDataset ? '待运行' : '待导入'}</strong>
                </div>
              </div>
              <div className="dataset-card__actions dataset-card__actions--compact">
                <button className="secondary-button" type="button" onClick={() => setIsDataModalOpen(true)} disabled={!hasDataset}>
                  <Table size={14} />
                  数据表
                </button>
                <button className="secondary-button is-subtle" type="button" onClick={saveSnapshot} disabled={!hasDataset}>
                  <Save size={14} />
                  保存快照
                </button>
              </div>
            </div>

            {snapshots.length > 0 ? (
              <div className="snapshot-toolbar snapshot-toolbar--compact">
                <div className="snapshot-toolbar__summary">
                  <span>历史快照</span>
                  <strong>{snapshotSummaryText}</strong>
                </div>
                <div className="snapshot-toolbar__actions">
                  <div className="snapshot-filter-tabs" aria-label="历史快照筛选">
                    {snapshotFilterOptions.map((option) => (
                      <button
                        className={snapshotViewFilter === option.id ? 'is-active' : ''}
                        type="button"
                        key={option.id}
                        onClick={() => {
                          setSnapshotViewFilter(option.id)
                          setSelectedSnapshotIds([])
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="secondary-button is-subtle"
                    type="button"
                    onClick={() => {
                      setIsSnapshotManageMode((current) => !current)
                      setSelectedSnapshotIds([])
                    }}
                  >
                    {isSnapshotManageMode ? <Check size={14} /> : <SlidersHorizontal size={14} />}
                    {isSnapshotManageMode ? '完成' : '管理'}
                  </button>
                </div>
              </div>
            ) : null}

          {isSnapshotManageMode ? (
            <div className="snapshot-batchbar">
              <button className="secondary-button" type="button" onClick={toggleAllSnapshots} disabled={visibleSnapshotIds.length === 0}>
                {visibleSnapshotIds.length > 0 && visibleSnapshotIds.every((id) => selectedSnapshotIdSet.has(id)) ? '取消全选' : '全选'}
              </button>
              <span>{selectedSnapshotIds.length} 已选</span>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setSelectedSnapshotFlag('pinned', !selectedSnapshotsAllPinned)}
                disabled={selectedSnapshotIds.length === 0}
              >
                <Pin size={14} />
                {selectedSnapshotsAllPinned ? '取消置顶' : '置顶'}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setSelectedSnapshotFlag('favorite', !selectedSnapshotsAllFavorite)}
                disabled={selectedSnapshotIds.length === 0}
              >
                <Star size={14} />
                {selectedSnapshotsAllFavorite ? '取消收藏' : '收藏'}
              </button>
              <button className="secondary-button is-danger" type="button" onClick={deleteSelectedSnapshots} disabled={selectedSnapshotIds.length === 0}>
                <Trash2 size={14} />
                删除
              </button>
            </div>
          ) : null}

          <div className={`snapshot-list snapshot-list--compact ${isSnapshotManageMode ? 'is-managing' : ''}`}>
            {snapshots.length === 0 ? (
              <div className="empty-history">
                <History size={17} />
                保存一次当前数据后，这里会形成可回溯的项目索引。
              </div>
            ) : visibleSnapshots.length === 0 ? (
              <div className="empty-history">
                <History size={17} />
                当前筛选下没有快照。
              </div>
            ) : (
              visibleSnapshots.map((snapshot) => (
                <article
                  className={`snapshot-item ${snapshot.pinned ? 'is-pinned' : ''} ${snapshot.favorite ? 'is-favorite' : ''} ${
                    selectedSnapshotIdSet.has(snapshot.id) ? 'is-selected' : ''
                  }`}
                  key={snapshot.id}
                >
                  {renamingSnapshotId === snapshot.id ? (
                    <div className="snapshot-rename">
                      <input
                        value={snapshotNameDraft}
                        aria-label="快照名称"
                        onChange={(event) => setSnapshotNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitRenameSnapshot(snapshot.id)
                          if (event.key === 'Escape') cancelRenameSnapshot()
                        }}
                      />
                      <button className="snapshot-icon-button" type="button" title="保存名称" onClick={() => commitRenameSnapshot(snapshot.id)}>
                        <Check size={14} />
                      </button>
                      <button className="snapshot-icon-button" type="button" title="取消" onClick={cancelRenameSnapshot}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="snapshot-item__header">
                      {isSnapshotManageMode ? (
                        <label className="snapshot-select" title="选择快照">
                          <input
                            type="checkbox"
                            checked={selectedSnapshotIdSet.has(snapshot.id)}
                            onChange={() => toggleSnapshotSelection(snapshot.id)}
                          />
                        </label>
                      ) : null}
                      <button
                        className="snapshot-item__main"
                        type="button"
                        onClick={() => (isSnapshotManageMode ? toggleSnapshotSelection(snapshot.id) : restoreSnapshot(snapshot))}
                      >
                        <span>
                          <strong>{snapshot.label}</strong>
                          <small>{new Date(snapshot.createdAt).toLocaleString()}</small>
                          {snapshot.pinned || snapshot.favorite ? (
                            <span className="snapshot-badges">
                              {snapshot.pinned ? <em>置顶</em> : null}
                              {snapshot.favorite ? <em>收藏</em> : null}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <div className="snapshot-actions">
                        <button
                          className={`snapshot-icon-button ${snapshot.pinned ? 'is-active' : ''}`}
                          type="button"
                          title={snapshot.pinned ? '取消置顶' : '置顶'}
                          onClick={() => toggleSnapshotFlag(snapshot.id, 'pinned')}
                        >
                          <Pin size={14} />
                        </button>
                        <button
                          className={`snapshot-icon-button ${snapshot.favorite ? 'is-active' : ''}`}
                          type="button"
                          title={snapshot.favorite ? '取消收藏' : '收藏'}
                          onClick={() => toggleSnapshotFlag(snapshot.id, 'favorite')}
                        >
                          <Star size={14} />
                        </button>
                        <button className="snapshot-icon-button" type="button" title="重命名" onClick={() => startRenameSnapshot(snapshot)}>
                          <Pencil size={14} />
                        </button>
                        <button className="snapshot-icon-button" type="button" title="删除" onClick={() => deleteSnapshot(snapshot)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    className="snapshot-item__detail"
                    type="button"
                    onClick={() => (isSnapshotManageMode ? toggleSnapshotSelection(snapshot.id) : restoreSnapshot(snapshot))}
                  >
                    <em>{snapshot.formula}</em>
                    <small>{snapshot.result ? '含结果' : '仅配置'} · {new Date(snapshot.createdAt).toLocaleDateString()}</small>
                  </button>
                </article>
              ))
            )}
          </div>
          </div>
        </aside>
        ) : null}

        <section className="main-stage">
          {workspaceMode === 'publication' ? (
            renderCustomPublicationWorkbench()
          ) : (
            <>
              {workspaceMode !== 'result' ? (
                <>
                  <section className="workbench-focus">
                    <div className="workbench-focus__copy">
                      <span className="panel__label">Main workspace</span>
                      <h2>{workspaceHeading}</h2>
                      <p>{workspaceLead}</p>
                    </div>
                    <div className="workbench-focus__actions">
                      {result ? (
                        <button className="secondary-button is-subtle" type="button" onClick={openPublicationWorkbench} disabled={!result}>
                          论文表
                        </button>
                      ) : null}
                      {result ? (
                        <button className="secondary-button is-subtle" type="button" onClick={openExportDialog} disabled={!result}>
                          <Download size={14} />
                          导出结果
                        </button>
                      ) : null}
                      {isModelRunning ? (
                        <button className="secondary-button is-subtle" type="button" onClick={cancelRunTask}>
                          <X size={14} />
                          取消
                        </button>
                      ) : null}
          <button className="primary-button" type="button" onClick={handleRunModel} disabled={!hasActiveModel || !hasDataset || isModelRunning || validationErrors.length > 0}>
                        <Play size={14} />
                        {validationErrors.length > 0 ? '需调整后运行' : isModelRunning ? '运行中' : hasStaleResult ? '重新运行' : '运行模型'}
                      </button>
                    </div>
                  </section>

                  <section className={`model-confirm-strip ${hasActiveModel ? 'is-selected' : 'is-empty'}`} aria-label="当前模型">
                    <div>
                      <span>当前模型</span>
                      <strong>{hasActiveModel ? activeModel.name : '尚未选择模型'}</strong>
                      <small>{hasActiveModel ? `${activeModel.shortName || activeModel.methodLabel} · ${getModelTaskGroup(activeModel)}` : '请先在模型库中选择并应用模型'}</small>
                    </div>
                    {hasActiveModel ? <em>已选择</em> : null}
                    <button
                      className={hasActiveModel ? 'secondary-button is-subtle' : 'primary-button'}
                      type="button"
                      onClick={hasActiveModel ? () => setWorkflowStep(hasDataset ? 'variables' : 'upload') : openModelLibrary}
                      disabled={isModelRunning}
                    >
                      {hasActiveModel ? (hasDataset ? '设置变量' : '继续上传') : '打开模型库'}
                    </button>
                  </section>
                </>
              ) : null}

              {hasDataset && workspaceMode !== 'result' ? (
                <section className="workbench-meta-strip" aria-label="当前工作区状态">
                  <span>{activeModel.name}</span>
                  <span>{rows.length} 个观测</span>
                  <span>{profiles.length} 个字段</span>
                  <span>{panelDiagnosis.title}</span>
                  <span>{modelMaturity.label}</span>
                </section>
              ) : null}

              {shouldShowFocusTask ? (
              <section className={`focus-task-card is-${workspaceMode} ${isModelRunning ? 'is-running' : ''} ${hasStaleResult ? 'is-stale' : ''}`}>
                <div>
                  <strong>
                    {isModelRunning
                      ? `正在运行 ${runTask?.modelName ?? activeModel.name}`
                      : runTask?.status === 'cancelled'
                        ? '本次运行已取消'
                        : hasStaleResult
                          ? '参数已经更新，结果需要刷新'
                          : result
                            ? '当前结果可继续阅读或导出'
                            : '当前任务是完成建模设定'}
                  </strong>
                  <p>{nextAction}</p>
                </div>
                {isModelRunning && runTask ? (
                  <div className="run-task-progress" aria-label="模型运行进度">
                    <div>
                      <span>{runTask.progress}%</span>
                      <span>
                        {formatDuration(runTask.elapsedMs)} / {formatDuration(runTask.estimatedMs)}
                      </span>
                    </div>
                    <progress value={runTask.progress} max={100} />
                  </div>
                ) : null}
              </section>
              ) : null}

              {workspaceMode !== 'result' ? renderWorkflowGuidance() : null}

              {result || isModelRunning || uploadError ? (
              <section className="results-workspace">
                <div className="result-panel result-primary-panel">
                  <div className="result-primary-header">
                    <div className="result-primary-header__copy">
                      <div className="section-title">
                        <Activity size={18} />
                        <h2>{result ? '结果阅读' : '当前任务'}</h2>
                      </div>
                      <p>{activeModel.name} · {activeFormula}</p>
                    </div>
                    <div className="export-actions">
                      <button className="ghost-button" type="button" onClick={openExportDialog} disabled={!result} title="选择格式和导出内容">
                        导出
                      </button>
                    </div>
                  </div>

                  <ResultReadingPanel
                    result={result}
                    isModelRunning={isModelRunning}
                    hasStaleResult={hasStaleResult}
                    modelName={activeModel.name}
                    formula={activeFormula}
                    leadInsight={leadInsight}
                    secondaryInsights={secondaryInsights}
                    visibleSummaryMetrics={visibleSummaryMetrics}
                    mainResultTable={mainResultTable}
                    secondaryResultTables={secondaryResultTables}
                    runTask={runTask}
                    error={uploadError}
                  />
                </div>
              </section>
              ) : null}
            </>
          )}
        </section>

        {workspaceMode !== 'publication' ? (
        <aside className="panel config-panel">
          <div className="panel__header">
            <div>
              <span className="panel__label">Model</span>
              <h2>模型与参数</h2>
            </div>
            <button className="ghost-button" type="button" onClick={openModelLibrary} title="模型库" disabled={isModelRunning}>
              <Search size={16} />
            </button>
          </div>

          <div className="active-model-card">
            {hasActiveModel ? (
              <>
                <div className="active-model-card__header">
                  <span>{getModelTaskGroup(activeModel)}</span>
                  <em className="model-status-badge">已选择</em>
                  <button className="secondary-button is-subtle" type="button" onClick={openModelLibrary} disabled={isModelRunning}>
                    切换模型
                  </button>
                </div>
                <small className="model-description">{activeModel.description}</small>
                <div className={`model-quality is-${modelMaturity.level}`}>
                  <strong>{modelMaturity.label}</strong>
                  <span>{modelMaturity.description}</span>
                </div>
                <div className="model-identity">
                  <span>{getModelTaskGroup(activeModel)}</span>
                  <code>{activeFormula}</code>
                </div>
              </>
            ) : (
              <>
                <div className="active-model-card__header">
                  <span>未选择</span>
                  <button className="secondary-button is-subtle" type="button" onClick={openModelLibrary} disabled={isModelRunning}>
                    打开模型库
                  </button>
                </div>
                <small className="model-description">请选择一个模型后再上传数据、设置变量和运行分析。</small>
                <div className="model-identity">
                  <span>当前状态</span>
                  <code>尚未选择模型</code>
                </div>
              </>
            )}
          </div>

          {isModelRunning ? (
            <div className="parameter-lock-notice">
              <Activity size={14} />
              <span>模型运行中，参数已临时锁定。</span>
            </div>
          ) : null}

          <section className="model-setup-card">
            <div className="parameter-section__header">
              <strong>变量与参数</strong>
              <span>字段、控制变量和推断设置已集中到弹窗中。</span>
            </div>
            <div className="variable-summary-card">
              <div>
                <span>{activeModel.targetLabel}</span>
                <strong>{selectedTarget || '未设置'}</strong>
              </div>
              <div>
                <span>{activeModel.featuresLabel}</span>
                <strong>{selectedFeatureSummary}</strong>
              </div>
              <div>
                <span>检查状态</span>
                <strong>{validationErrors.length > 0 ? validationErrors[0].message : '可以运行'}</strong>
              </div>
            </div>
            <button className="primary-button is-full" type="button" onClick={openVariableSetup} disabled={!hasActiveModel || !hasDataset || isModelRunning}>
              设置变量与参数
            </button>
          </section>

        </aside>
        ) : null}
      </section>

      {isVariableSetupOpen ? renderVariableSetupModal() : null}

      {isModelLibraryOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="model-library-modal" role="dialog" aria-modal="true" aria-label="模型库">
            <div className="data-modal__header">
              <div>
                <span className="panel__label">Model library</span>
                <h2>选择模型插件</h2>
                <p>按分析任务组织模型，支持中文名、英文简称和关键词搜索。</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setIsModelLibraryOpen(false)} title="关闭">
                <X size={16} />
              </button>
            </div>

            <div className="modal-summary-strip">
              <div>
                <span>当前模型</span>
                <strong>{hasActiveModel ? activeModel.name : '尚未选择模型'}</strong>
              </div>
              <div>
                <span>待应用</span>
                <strong>{draftModel ? (draftModel.id === activeModelId ? '当前模型' : draftModel.name) : '请先点选模型'}</strong>
              </div>
              <div>
                <span>匹配结果</span>
                <strong>{filteredModelPlugins.length} 个插件</strong>
              </div>
            </div>

            <div className="model-library-toolbar">
              <div className="model-search">
                <Search size={15} />
                <input
                  value={modelSearch}
                  placeholder="搜索模型、简称或关键词"
                  onChange={(event) => setModelSearch(event.target.value)}
                />
              </div>
              <div className="model-category-tabs" aria-label="模型分类筛选">
                {modelCategories.map((category) => (
                  <button
                    className={category === selectedModelCategory ? 'is-active' : ''}
                    type="button"
                    key={category}
                    onClick={() => setSelectedModelCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="model-library-content">
              {recentModelPlugins.length > 0 && !modelSearch.trim() && selectedModelCategory === allModelCategory ? (
                <div className="recent-model-strip">
                  <span>最近使用</span>
                  <div>
                    {recentModelPlugins.map((plugin) => (
                      <button className={plugin.id === draftModel?.id ? 'is-draft' : ''} type="button" key={plugin.id} onClick={() => setDraftModelId(plugin.id)}>
                        <strong>{plugin.name}</strong>
                        <small>{plugin.shortName}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="model-library-grid">
                {filteredModelPlugins.map((plugin) => {
                  const maturity = getModelMaturity(plugin)

                  return (
                    <button
                      className={`model-library-card ${plugin.id === activeModelId ? 'is-current' : ''} ${plugin.id === draftModel?.id ? 'is-draft' : ''}`}
                      type="button"
                      key={plugin.id}
                      onClick={() => setDraftModelId(plugin.id)}
                    >
                      <span>{getModelTaskGroup(plugin)}</span>
                      <em className={`model-maturity-badge is-${maturity.level}`}>{maturity.label}</em>
                      {plugin.id === activeModelId ? <em className="model-library-card__status">当前使用</em> : null}
                      {plugin.id === draftModel?.id && plugin.id !== activeModelId ? <em className="model-library-card__status">待应用</em> : null}
                      <strong>
                        {plugin.name}（{plugin.shortName}）
                      </strong>
                      <small>{plugin.fullName}</small>
                      <p>{getModelUseCase(plugin)}</p>
                    </button>
                  )
                })}
                {filteredModelPlugins.length === 0 ? <div className="empty-history">没有匹配的模型插件。</div> : null}
              </div>
            </div>

            <div className="model-library-footer">
              <div>
                <span>当前待应用</span>
                <strong>{draftModel?.name ?? '尚未点选模型'}</strong>
                <small>{draftModel?.fullName ?? '请先在模型库中点选一个模型'}</small>
              </div>
              <button className="primary-button" type="button" onClick={applyDraftModel} disabled={isModelRunning || !draftModel || draftModel.id === activeModelId}>
                {!draftModel ? '请选择模型' : draftModel.id === activeModelId ? '当前已使用' : '使用此模型'}
              </button>
            </div>
          </section>
        </div>
	      ) : null}

      {isExportModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="export-modal" role="dialog" aria-modal="true" aria-label="导出结果">
            <div className="data-modal__header">
              <div>
                <span className="panel__label">Export</span>
                <h2>选择导出内容</h2>
                <p>
                  {activeModel.name} · 已选择 {selectedExportItemIds.length} / {exportItems.length} 项
                </p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setIsExportModalOpen(false)} title="关闭">
                <X size={16} />
              </button>
            </div>

            <div className="export-modal__body">
              <section className="export-format-panel">
                <strong>导出格式</strong>
                {[
                  { id: 'excel', label: 'Excel 多 sheet（.xlsx）', detail: '真实 xlsx 文件，可直接打开' },
                  { id: 'html', label: 'HTML 报告', detail: '适合浏览器查看' },
                  { id: 'word', label: 'Word 报告', detail: '适合初稿报告' },
                  { id: 'csv', label: 'CSV', detail: '轻量原始表格' },
                  { id: 'json', label: 'JSON', detail: '参数与结果快照' },
                ].map((format) => (
                  <button
                    className={exportFormat === format.id ? 'is-active' : ''}
                    type="button"
                    key={format.id}
                    onClick={() => setExportFormat(format.id as ExportFormat)}
                  >
                    <span>{format.label}</span>
                    <small>{format.detail}</small>
                  </button>
                ))}
              </section>

              <section className="export-content-panel">
                <div className="export-content-toolbar">
                  <div>
                    <strong>导出表与附加信息</strong>
                    <span>按本次模型实际产出的表选择，未勾选的内容不会进入文件。</span>
                  </div>
                  <div>
                    <button className="secondary-button" type="button" onClick={selectCoreExportItems}>
                      核心结果
                    </button>
                    <button className="secondary-button" type="button" onClick={clearExportItems}>
                      清空
                    </button>
                    <button className="secondary-button" type="button" onClick={selectAllExportItems}>
                      全选
                    </button>
                  </div>
                </div>

                <div className="export-item-list">
                  {exportItems.map((item) => (
                    <div className={`export-item is-${item.kind}`} key={item.id}>
                      <label className="export-item__check">
                        <input
                          type="checkbox"
                          checked={selectedExportItemSet.has(item.id)}
                          disabled={isExporting}
                          onChange={() => toggleExportItem(item.id)}
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </span>
                      </label>
                      <button className="export-item__only" type="button" onClick={() => selectOnlyExportItem(item.id)} disabled={isExporting}>
                        仅此项
                      </button>
                    </div>
                  ))}
                </div>

                {customPublicationEnabled ? renderCustomPublicationExportSummary() : null}
              </section>
            </div>

            {exportError ? (
              <div className="export-error" role="alert">
                <AlertTriangle size={15} />
                {exportError}
              </div>
            ) : null}

            <div className="export-modal__footer">
              <button className="secondary-button" type="button" onClick={() => setIsExportModalOpen(false)} disabled={isExporting}>
                取消
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={submitExport}
                disabled={selectedExportItemIds.length === 0 || isExporting}
              >
                <Download size={15} />
                {isExporting ? '正在生成...' : '导出'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {runFailureDialog ? (
        <div className="modal-backdrop" role="presentation">
          <section className="run-failure-modal" role="dialog" aria-modal="true" aria-label="模型运行失败">
            <div className="data-modal__header">
              <div>
                <span className="panel__label">Run failed</span>
                <h2>模型运行失败</h2>
                <p>{runFailureDialog.modelName} · {runFailureDialog.formula}</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setRunFailureDialog(null)} title="关闭">
                <X size={16} />
              </button>
            </div>

            <div className="run-failure-modal__body">
              <div className="run-failure-message">
                <AlertTriangle size={18} />
                <div>
                  <strong>{runFailureDialog.message}</strong>
                  <p>请回到变量设定，减少高度相关变量、调整固定效应或修改参数后重新运行。</p>
                </div>
              </div>
              {validationErrors.length > 0 ? (
                <p className="run-failure-hint">当前仍需处理：{validationErrors[0].message}</p>
              ) : null}
            </div>

            <div className="import-wizard__footer">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setRunFailureDialog(null)
                  openVariableSetup()
                }}
              >
                返回变量设定
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setRunFailureDialog(null)
                  handleRunModel()
                }}
                disabled={validationErrors.length > 0 || !hasActiveModel || !hasDataset || isModelRunning}
              >
                <Play size={14} />
                重新运行
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {missingValueAlert ? (
        <div className="modal-backdrop" role="presentation">
          <section className="missing-alert-modal" role="dialog" aria-modal="true" aria-label="缺失值提醒">
            <div className="data-modal__header">
              <div>
                <span className="panel__label">Missing values</span>
                <h2>检测到缺失值</h2>
                <p>{missingValueAlert.fileName} · 上传后先确认数据质量，再继续设置维度字段。</p>
              </div>
              <button className="ghost-button" type="button" onClick={cancelMissingValueImport} title="取消导入">
                <X size={16} />
              </button>
            </div>

            <div className="missing-alert-modal__body">
              <div className="missing-alert-summary">
                <div>
                  <span>缺失单元格</span>
                  <strong>{missingValueAlert.missingCells}</strong>
                </div>
                <div>
                  <span>涉及行数</span>
                  <strong>{missingValueAlert.affectedRows}</strong>
                </div>
                <div>
                  <span>涉及字段</span>
                  <strong>{missingValueAlert.fields.length}</strong>
                </div>
              </div>

              <div className="missing-alert-fields">
                <strong>缺失较多的字段</strong>
                {missingValueAlert.fields.slice(0, 6).map((field) => (
                  <div key={field.name}>
                    <span>{field.name}</span>
                    <em>{field.missing} 个缺失</em>
                  </div>
                ))}
              </div>

              <p className="missing-alert-note">
                当前模型运行仍沿用默认规则：目标变量缺失会被排除，解释变量缺失按现有运行规则处理。
              </p>
            </div>

            <div className="import-wizard__footer">
              <button className="secondary-button" type="button" onClick={cancelMissingValueImport}>
                取消导入
              </button>
              <button className="primary-button" type="button" onClick={continueImportAfterMissingAlert}>
                继续设置维度字段
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingImport ? (
        <div className="modal-backdrop" role="presentation">
          <section className="import-wizard" role="dialog" aria-modal="true" aria-label="导入数据向导">
            <div className="data-modal__header">
              <div>
                <span className="panel__label">Import wizard</span>
                <h2>设置数据维度字段</h2>
                <p>
                  {pendingImport.fileName} · {pendingImport.rows.length} 行 · {pendingColumns.length} 字段
                </p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setPendingImport(null)} title="取消导入">
                <X size={16} />
              </button>
            </div>

            <div className="modal-summary-strip">
              <div>
                <span>导入原则</span>
                <strong>维度字段不会进入后续因变量和自变量候选</strong>
              </div>
              <div>
                <span>当前 ID</span>
                <strong>{pendingImport.roles.idFields.join(', ') || '未设置'}</strong>
              </div>
              <div>
                <span>当前 Time</span>
                <strong>{pendingImport.roles.timeField || '未设置'}</strong>
              </div>
            </div>

            <div className="import-wizard__body">
              <section className="role-picker">
                <div className="section-title">
                  <Database size={17} />
                  <h2>ID 字段</h2>
                </div>
                <p>实体唯一标识，例如公司、用户、城市。可多选；确认后不会进入因变量和自变量候选。</p>
                <div className="role-field-list">
                  {pendingProfiles.map((profile) => (
                    <label className={pendingImport.roles.idFields.includes(profile.name) ? 'is-selected' : ''} key={profile.name}>
                      <input
                        type="checkbox"
                        checked={pendingImport.roles.idFields.includes(profile.name)}
                        onChange={() => togglePendingRoleField('id', profile.name)}
                      />
                      <span>
                        <strong>{profile.name}</strong>
                        <small>
                          {profile.type} · {profile.unique} unique
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="role-picker">
                <div className="section-title">
                  <Activity size={17} />
                  <h2>Time 字段</h2>
                </div>
                <p>时间维度，例如 year、month、date。只能选择一个。</p>
                <select value={pendingImport.roles.timeField} onChange={(event) => setPendingTimeField(event.target.value)}>
                  <option value="">不设置时间字段</option>
                  {pendingColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>

                <div className="role-picker__summary">
                  <span>ID</span>
                  <strong>{pendingImport.roles.idFields.join(', ') || '未设置'}</strong>
                  <span>Time</span>
                  <strong>{pendingImport.roles.timeField || '未设置'}</strong>
                  <span>Group</span>
                  <strong>{pendingImport.roles.groupFields.join(', ') || '未设置'}</strong>
                </div>
              </section>

              <section className="role-picker">
                <div className="section-title">
                  <SlidersHorizontal size={17} />
                  <h2>Group 字段</h2>
                </div>
                <p>分组维度，例如行业、地区、实验组。可多选；后续可用于分组回归或固定效应。</p>
                <div className="role-field-list">
                  {pendingProfiles.map((profile) => (
                    <label className={pendingImport.roles.groupFields.includes(profile.name) ? 'is-selected' : ''} key={profile.name}>
                      <input
                        type="checkbox"
                        checked={pendingImport.roles.groupFields.includes(profile.name)}
                        onChange={() => togglePendingRoleField('group', profile.name)}
                      />
                      <span>
                        <strong>{profile.name}</strong>
                        <small>
                          {profile.type} · {profile.unique} unique
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="import-preview">
                <div className="section-title">
                  <Table size={17} />
                  <h2>导入预览</h2>
                  <span className="section-meta">前 {pendingPreviewRows.length} 行</span>
                </div>
                <div className="import-preview__table-shell">
                  <div
                    className="data-preview data-preview--import data-preview--import-header"
                    style={{ gridTemplateColumns: `repeat(${pendingColumns.length}, minmax(96px, 132px))` }}
                  >
                    {pendingColumns.map((column) => (
                      <strong className={hasField(pendingImport.roles, column) ? 'is-dimension-column' : ''} key={column}>
                        {column}
                      </strong>
                    ))}
                  </div>
                  <div
                    className="data-preview data-preview--import data-preview--import-body"
                    style={{ gridTemplateColumns: `repeat(${pendingColumns.length}, minmax(96px, 132px))` }}
                  >
                    {pendingPreviewRows.flatMap((row, rowIndex) =>
                      pendingColumns.map((column) => (
                        <span className={isMissingCell(row[column]) ? 'is-missing' : ''} key={`${rowIndex}-${column}`}>
                          {previewValue(row[column])}
                        </span>
                      )),
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className="import-wizard__footer">
              <button className="secondary-button" type="button" onClick={() => setPendingImport(null)}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={confirmImport}>
                确认导入
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isDataModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="data-modal" role="dialog" aria-modal="true" aria-label="数据表预览">
            <div className="data-modal__header">
              <div>
                <span className="panel__label">Data table</span>
                <h2>{fileName}</h2>
                <p>
                  {rows.length} 行 · {profiles.length} 字段 · 虚拟滚动预览
                </p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setIsDataModalOpen(false)} title="关闭">
                <X size={16} />
              </button>
            </div>

            <div className="data-modal__body">
              <aside className="field-inspector">
                <div className="section-title">
                  <Database size={17} />
                  <h2>字段角色</h2>
                </div>
                <div className="dimension-summary">
                  <div>
                    <span>ID</span>
                    <strong>{summarizeFields(dataRoles.idFields)}</strong>
                  </div>
                  <div>
                    <span>Time</span>
                    <strong>{dataRoles.timeField || '未设置'}</strong>
                  </div>
                  <div>
                    <span>Group</span>
                    <strong>{summarizeFields(dataRoles.groupFields)}</strong>
                  </div>
                </div>
                <div className={`diagnosis-strip is-${panelDiagnosis.status}`}>
                  <strong>{panelDiagnosis.title}</strong>
                  <span>
                    {panelDiagnosis.status === 'not-configured'
                      ? '设置 ID + Time 后判断平衡性'
                      : `${panelDiagnosis.idCount} ID · ${panelDiagnosis.timeCount} Time · 缺失 ${panelDiagnosis.missingCombinations} · 重复 ${panelDiagnosis.duplicateCombinations}`}
                  </span>
                </div>
                <div className="field-list">
                  {profiles.map((profile) => (
                    <div
                      className={`field-row ${
                        hasField(dataRoles, profile.name)
                          ? 'is-dimension'
                          : activeModel.requiresTarget
                          ? profile.name === selectedTarget
                            ? 'is-target'
                            : ''
                          : selectedFeatures.includes(profile.name)
                            ? 'is-target'
                            : ''
                      }`}
                      key={profile.name}
                    >
                      <button
                        className="field-row__main"
                        type="button"
                        onClick={() =>
                          (activeModel.requiresTarget ? numericColumns.includes(profile.name) : eligibleFeatureColumns.includes(profile.name)) &&
                          !hasField(dataRoles, profile.name) &&
                          setModelConfig((current) =>
                            activeModel.requiresTarget
                              ? { ...current, target: profile.name }
                              : {
                                  ...current,
                                  features: current.features.includes(profile.name)
                                    ? current.features.filter((feature) => feature !== profile.name)
                                    : [...current.features, profile.name],
                                },
                          )
                        }
                        disabled={
                          !(activeModel.requiresTarget ? numericColumns.includes(profile.name) : eligibleFeatureColumns.includes(profile.name)) ||
                          hasField(dataRoles, profile.name)
                        }
                      >
                        <span>
                          <strong>{profile.name}</strong>
                          <small>
                            {profile.type} · {profile.unique} unique
                          </small>
                        </span>
                        <em>{fieldRoleLabel(dataRoles, profile.name) || `${profile.missing} miss`}</em>
                      </button>
                      <select
                        className="role-select"
                        value={fieldRoleValue(dataRoles, profile.name)}
                        aria-label={`${profile.name} role`}
                        onChange={(event) => setDataFieldRole(profile.name, event.target.value)}
                      >
                        <option value="model">建模</option>
                        <option value="id">ID</option>
                        <option value="time">Time</option>
                        <option value="group">Group</option>
                      </select>
                      <select
                        className="type-select"
                        value={profile.type}
                        aria-label={`${profile.name} type`}
                        onChange={(event) => updateColumnType(profile.name, event.target.value as ColumnType)}
                      >
                        {typeOptions.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </aside>

              <div className="data-modal__table">
                <div className="section-title">
                  <Table size={17} />
                  <h2>数据预览</h2>
                  <span className="section-meta">
                    {rows.length > 0 ? `${virtualPreviewStart + 1}-${virtualPreviewEnd} / ${rows.length}` : '0 行'}
                  </span>
                </div>
                <div className="data-preview-shell">
                  <div
                    className="data-preview data-preview--header"
                    style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(120px, 1fr))` }}
                  >
                    {previewColumns.map((column) => (
                      <strong className={dimensionColumns.has(column) ? 'is-dimension-column' : ''} key={column}>
                        {column}
                      </strong>
                    ))}
                  </div>
                  <div
                    className="data-preview data-preview--body is-virtualized"
                    onScroll={(event) => setDataPreviewScrollTop(event.currentTarget.scrollTop)}
                    style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(120px, 1fr))` }}
                  >
                    {virtualPreviewStart > 0 ? (
                      <span
                        className="data-preview__spacer"
                        style={{ gridColumn: `1 / span ${Math.max(previewColumns.length, 1)}`, height: virtualPreviewStart * dataPreviewRowHeight }}
                      />
                    ) : null}
                    {virtualPreviewRows.flatMap((row, rowIndex) =>
                      previewColumns.map((column) => (
                        <span
                          className={row[column] === null || row[column] === '' ? 'is-missing' : ''}
                          key={`${virtualPreviewStart + rowIndex}-${column}`}
                        >
                          {previewValue(row[column])}
                        </span>
                      )),
                    )}
                    {virtualPreviewEnd < rows.length ? (
                      <span
                        className="data-preview__spacer"
                        style={{
                          gridColumn: `1 / span ${Math.max(previewColumns.length, 1)}`,
                          height: (rows.length - virtualPreviewEnd) * dataPreviewRowHeight,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
