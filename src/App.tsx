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
  Settings,
  SlidersHorizontal,
  Star,
  Table,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { type DataPrepConfig, type RunLogEntry } from './data/preprocess'
import { formatNumber, profileRows, rowsFromSheet } from './data/tableUtils'
import { buildBaselinePublicationTable, buildCustomPublicationTable, publicationTableToRows, type CustomPublicationSource, type PublicationTable } from './export/publicationTables'
import type { ColumnType, Row, TypeOverrides } from './data/types'
import { getModelPlugin, modelPlugins } from './models/registry'
import type { InferenceConfig, ModelConfig, ModelMetric, ModelParamValue, ModelPlugin, ModelResult, SpatialWeightsParam } from './models/types'
import './App.css'

const formatMetricValue = (metric: ModelMetric | undefined) => {
  if (!metric) return 'waiting'
  return typeof metric.value === 'number' ? formatNumber(metric.value, metric.precision ?? 3) : metric.value
}

const stableMaturity: NonNullable<ModelPlugin['maturity']> = {
  level: 'stable',
  label: '正式',
  description: '浏览器内结果可用于常规探索分析。',
}

const columnLabels: Record<string, string> = {
  source: 'Source',
  ss: 'SS',
  df: 'df',
  ms: 'MS',
  term: 'Variable',
  coefficient: 'Coefficient',
  stdError: 'Std. err.',
  tValue: 't',
  pValue: 'P>|t|',
  ciLow: '[95% conf.',
  ciHigh: 'interval]',
  topic: 'Topic',
  documents: 'Documents',
  share: 'Share',
  keywords: 'Keywords',
  representative: 'Representative',
  document: 'Document',
  score: 'Score',
  text: 'Text',
  path: 'Path',
  zValue: 'z',
  oddsRatio: 'Odds ratio',
  level: 'Level',
  moderatorValue: 'Moderator',
  effect: 'Effect',
  threshold: 'Threshold',
  rSquared: 'R-squared',
  lowCoefficient: 'Low coef.',
  highCoefficient: 'High coef.',
  leftObs: 'Left obs',
  rightObs: 'Right obs',
  model: 'Model',
  spatialKey: 'Spatial key',
  neighborKey: 'Neighbor key',
  weightField: 'Weight',
  lagTerm: 'Lag term',
  neighborRule: 'Neighbor rule',
  validWeights: 'Valid W',
  rootMse: 'Root MSE',
  logLikelihood: 'Log likelihood',
  specification: 'Specification',
  spatialTerms: 'Spatial terms',
  totalEffect: 'Total',
  spilloverShare: 'Spillover %',
  metric: 'Metric',
  value: 'Value',
  aPath: 'a path',
  bPath: 'b path',
  indirectEffect: 'Indirect',
  directEffect: 'Direct',
  groups: 'Groups',
  singletonGroups: 'Singletons',
  minObs: 'Min obs',
  maxObs: 'Max obs',
  avgObs: 'Avg obs',
  absorbedDf: 'Absorbed df',
  variable: 'Variable',
  reason: 'Reason',
  estimate: 'Estimate',
  bootCiLow: 'Boot CI low',
  bootCiHigh: 'Boot CI high',
  bootstrapReps: 'Bootstrap reps',
  count: 'Count',
  percent: 'Percent',
  cumulativePercent: 'Cum. percent',
  group: 'Group',
  median: 'Median',
  rowCategory: 'Row',
  rowTotal: 'Row total',
  variance: 'Variance',
  range: 'Range',
  iqr: 'IQR',
  comparison: 'Comparison',
  meanDiff: 'Mean diff',
  testValue: 'Test value',
  pairs: 'Pairs',
  skewness: 'Skewness',
  excessKurtosis: 'Ex. kurtosis',
  jarqueBera: 'Jarque-Bera',
  rankSum: 'Rank sum',
  meanRank: 'Mean rank',
  method: 'Method',
  statistic: 'Statistic',
  vif: 'VIF',
  tolerance: 'Tolerance',
  interpretation: 'Interpretation',
  marginalEffect: 'Marginal effect',
  note: 'Note',
}

const formatResultValue = (value: string | number, column: string) => {
  if (typeof value !== 'number') return value
  if (column === 'df' || column === 'n' || column === 'leftObs' || column === 'rightObs' || column === 'documents' || column === 'document') return formatNumber(value, 0)
  if (column === 'percent' || column === 'cumulativePercent') return `${formatNumber(value * 100, 2)}%`
  if (column === 'pValue') return value < 0.0005 ? '0.000' : value.toFixed(3)
  if (Number.isInteger(value) && Math.abs(value) >= 10) return formatNumber(value, 0)
  if (Math.abs(value) > 0 && Math.abs(value) < 0.001) return value.toPrecision(4)
  return formatNumber(value, 4)
}

const typeOptions: ColumnType[] = ['numeric', 'category', 'date', 'text', 'empty']
const missingOptions: Array<{ value: DataPrepConfig['missingStrategy']; label: string }> = [
  { value: 'drop', label: '删除含缺失行' },
  { value: 'mean', label: '均值填充' },
  { value: 'median', label: '中位数填充' },
]

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

type CustomPublicationConfig = {
  title: string
  note: string
  selectedSourceIds: string[]
  columns: Record<string, CustomPublicationColumnDraft>
}

type ProfessionalModelPayload = {
  taskId: string
  modelId: string
  rows: Row[]
  config: ModelConfig
  inference?: InferenceConfig
}

type ProfessionalModelResponse = {
  result?: ModelResult
  logs?: RunLogEntry[]
  backend?: string
  error?: string
}

type ProfessionalEnvironmentStatus = {
  modelId: string
  family: string
  status: 'checking' | 'ready' | 'partial' | 'fallback' | 'missing' | 'web' | 'error'
  activeBackend: string
  message: string
  python?: {
    available: boolean
    path: string
    version: string
    ok: boolean
  }
  packages?: Record<string, boolean>
  missingProfessional?: string[]
  missingLightweight?: string[]
  professionalReady?: boolean
  lightweightReady?: boolean
  checkedAt?: string
}

type ProfessionalInstallScope = 'lightweight' | 'professional'

type ProfessionalInstallStatus = {
  status: 'idle' | 'installing' | 'success' | 'error'
  scope?: ProfessionalInstallScope
  message: string
  stdout?: string
  stderr?: string
  missingAfterInstall?: string[]
}

type ProfessionalInstallResponse = {
  success: boolean
  message: string
  installed?: string[]
  stdout?: string
  stderr?: string
  command?: string
  returnCode?: number
  missingAfterInstall?: string[]
}

declare global {
  interface Window {
    visualStatsDesktop?: {
      platform: string
      versions: {
        electron: string
        chrome: string
      }
      runProfessionalModel?: (payload: ProfessionalModelPayload) => Promise<ProfessionalModelResponse>
      checkProfessionalEnvironment?: (payload: { modelId: string }) => Promise<ProfessionalEnvironmentStatus>
      installProfessionalDependencies?: (payload: { modelId: string; scope: ProfessionalInstallScope }) => Promise<ProfessionalInstallResponse>
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

const snapshotStorageKey = 'visual-stats-lab:snapshots'
const layoutStorageKey = 'visual-stats-lab:layout'
const modelUsageStorageKey = 'visual-stats-lab:model-usage'
const dataPreviewRowHeight = 34
const dataPreviewVisibleRows = 42
const dataPreviewOverscanRows = 8
const allModelCategory = '全部'

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

const advancedParameterIds = new Set(['neighborKey', 'weightField', 'spatialWeights', 'topicField', 'textField'])
const slowModelIds = new Set(['mediation-analysis', 'moderated-mediation', 'bertopic', 'reghdfe-regression', 'xtreg-fixed-effects'])
const professionalBackendModelIds = new Set(['bertopic'])
const isProfessionalBackendModel = (modelId: string) => professionalBackendModelIds.has(modelId) || modelId.startsWith('spatial-')

const modelUseCases: Record<string, string> = {
  'frequency-analysis': '查看分类、文本或时间字段的取值分布。',
  'category-summary': '按组比较数值变量的均值、中位数和波动。',
  'crosstab-chi-square': '检验两个分类变量是否存在关联。',
  'variance-analysis': '查看数值变量整体或分组后的离散程度。',
  'independent-t-test': '比较两个独立组的均值差异。',
  'one-sample-t-test': '检验一个变量的均值是否不同于给定值。',
  'paired-t-test': '比较同一对象前后或两列配对数据的均值差。',
  'normality-test': '判断数值变量是否明显偏离正态分布。',
  'nonparametric-test': '在分布偏态或不满足 t 检验假设时比较组间差异。',
  'linear-regression': '估计一个因变量与多个解释变量之间的线性关系。',
  'ordinary-regression': '快速执行多元 OLS 回归并查看系数显著性。',
  'xtreg-fixed-effects': '控制面板个体固定效应，估计组内变化关系。',
  'reghdfe-regression': '吸收多维固定效应，适合高维面板或分组数据。',
  'mediation-analysis': '分析 X 是否通过中介变量 M 影响 Y。',
  'moderation-analysis': '检验 W 是否改变 X 对 Y 的影响强度。',
  'moderated-mediation': '检验中介效应是否随调节变量 W 改变。',
  'spatial-sar': '估计相邻地区因变量的空间滞后影响。',
  'spatial-slx': '估计解释变量的邻近空间溢出。',
  'spatial-sdm': '同时估计 Wy 和 WX 的空间杜宾模型。',
  'spatial-sem': '识别误差项中的空间相关。',
  'spatial-sdem': '同时估计 WX 和误差空间相关。',
  'spatial-sac': '同时估计因变量滞后和误差空间相关。',
  'spatial-gns': '估计最完整的常见嵌套空间设定。',
  'spatial-panel-sdm': '在面板固定效应下估计空间杜宾模型。',
  'spatial-logit': '估计二分类结果的空间邻近影响。',
  'threshold-regression': '寻找门槛变量导致关系结构变化的切点。',
  'logit-regression': '估计二分类结果发生概率及 Odds Ratio。',
  'descriptive-statistics': '批量查看数值变量的样本量、均值和范围。',
  'correlation-analysis': '查看多个数值变量之间的 Pearson 相关关系。',
  bertopic: '从文本字段中抽取主题和代表关键词。',
}

const modelCategoryOrder = ['数据探索', '关系分析', '差异检验', '基础回归', '面板与固定效应', '机制检验', '扩展模型', '文本分析']

const modelCategoryOverrides: Record<string, string> = {
  'frequency-analysis': '数据探索',
  'category-summary': '数据探索',
  'descriptive-statistics': '数据探索',
  'variance-analysis': '数据探索',
  'normality-test': '数据探索',
  'correlation-analysis': '关系分析',
  'crosstab-chi-square': '关系分析',
  'independent-t-test': '差异检验',
  'one-sample-t-test': '差异检验',
  'paired-t-test': '差异检验',
  'nonparametric-test': '差异检验',
  'linear-regression': '基础回归',
  'ordinary-regression': '基础回归',
  'logit-regression': '基础回归',
  'xtreg-fixed-effects': '面板与固定效应',
  'reghdfe-regression': '面板与固定效应',
  'mediation-analysis': '机制检验',
  'moderation-analysis': '机制检验',
  'moderated-mediation': '机制检验',
  'spatial-sar': '扩展模型',
  'spatial-slx': '扩展模型',
  'spatial-sdm': '扩展模型',
  'spatial-sem': '扩展模型',
  'spatial-sdem': '扩展模型',
  'spatial-sac': '扩展模型',
  'spatial-gns': '扩展模型',
  'spatial-panel-sdm': '扩展模型',
  'spatial-logit': '扩展模型',
  'threshold-regression': '扩展模型',
  bertopic: '文本分析',
}

const getModelCategory = (plugin: ModelPlugin) => modelCategoryOverrides[plugin.id] ?? plugin.category

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

const getModelUseCase = (plugin: ModelPlugin) => modelUseCases[plugin.id] ?? plugin.description

const professionalStatusLabels: Record<ProfessionalEnvironmentStatus['status'], { label: string; tone: string }> = {
  checking: { label: '检测中', tone: 'checking' },
  ready: { label: '专业环境已就绪', tone: 'ready' },
  partial: { label: '轻量后端可用', tone: 'partial' },
  fallback: { label: '将使用降级路径', tone: 'fallback' },
  missing: { label: '专业环境不可用', tone: 'missing' },
  web: { label: '桌面端专属', tone: 'web' },
  error: { label: '检测失败', tone: 'error' },
}

const backendLabels: Record<string, string> = {
  professional: 'Python 专业后端',
  lightweight: 'Python 轻量后端',
  'python-fallback': 'Python 降级后端',
  browser: '浏览器内置估计',
  checking: '检测中',
}

const formatCheckTime = (value?: string) => {
  if (!value) return '尚未完成'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '尚未完成' : parsed.toLocaleString()
}

const extractMetricNumber = (result: ModelResult | null, label: string) => {
  const metric = result?.summary.find((entry) => entry.label === label)
  return typeof metric?.value === 'number' ? metric.value : null
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

const loadLayoutPreference = () => {
  try {
    const stored = window.localStorage.getItem(layoutStorageKey)
    return stored ? (JSON.parse(stored) as { historyCollapsed?: boolean }) : {}
  } catch {
    return {}
  }
}

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
  const initialLayout = useMemo(() => loadLayoutPreference(), [])
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
  const [activeModelId, setActiveModelId] = useState('linear-regression')
  const [isDataModalOpen, setIsDataModalOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [dataRoles, setDataRoles] = useState<DataRoles>(emptyDataRoles)
  const [isModelLibraryOpen, setIsModelLibraryOpen] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [selectedModelCategory, setSelectedModelCategory] = useState(allModelCategory)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')
  const [selectedExportItemIds, setSelectedExportItemIds] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [customPublicationConfig, setCustomPublicationConfig] = useState<CustomPublicationConfig>({
    title: '表 1：自定义回归结果',
    note: '注：稳健标准误；括号内为 t 值；* p<0.1，** p<0.05，*** p<0.01',
    selectedSourceIds: [],
    columns: {},
  })
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(Boolean(initialLayout.historyCollapsed))
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
  const [professionalEnv, setProfessionalEnv] = useState<ProfessionalEnvironmentStatus | null>(null)
  const [professionalInstall, setProfessionalInstall] = useState<ProfessionalInstallStatus>({ status: 'idle', message: '' })
  const [environmentCheckNonce, setEnvironmentCheckNonce] = useState(0)
  const [dataPreviewScrollTop, setDataPreviewScrollTop] = useState(0)
  const runCancelRef = useRef(false)
  const runWorkerRef = useRef<Worker | null>(null)
  const activeModel = getModelPlugin(activeModelId)
  const modelMaturity = activeModel.maturity ?? stableMaturity
  const activeModelUsesProfessionalBackend = isProfessionalBackendModel(activeModel.id)
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
    () => getFeatureColumnsForPlugin(activeModel, featureProfiles, prepConfig.categoricalEncoding),
    [activeModel, featureProfiles, prepConfig.categoricalEncoding],
  )
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => activeModel.getDefaultConfig([]))

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

  useEffect(() => {
    if (!activeModelUsesProfessionalBackend) {
      Promise.resolve().then(() => setProfessionalInstall({ status: 'idle', message: '' }))
      return undefined
    }

    let cancelled = false
    const applyEnvironmentStatus = (status: ProfessionalEnvironmentStatus) => {
      if (!cancelled) setProfessionalEnv(status)
    }
    const checker = window.visualStatsDesktop?.checkProfessionalEnvironment
    if (!checker) {
      Promise.resolve().then(() =>
        applyEnvironmentStatus({
          modelId: activeModel.id,
          family: activeModel.id === 'bertopic' ? 'bertopic' : 'spatial',
          status: 'web',
          activeBackend: 'browser',
          message: '当前为 Web 环境，专业 Python 后端仅在桌面端可用；运行时会使用浏览器内置估计。',
          checkedAt: new Date().toISOString(),
        }),
      )
      return undefined
    }

    Promise.resolve().then(() =>
      applyEnvironmentStatus({
        modelId: activeModel.id,
        family: activeModel.id === 'bertopic' ? 'bertopic' : 'spatial',
        status: 'checking',
        activeBackend: 'checking',
        message: '正在检测 Python、专业依赖和可用后端。',
        checkedAt: new Date().toISOString(),
      }),
    )
    checker({ modelId: activeModel.id })
      .then((status) => {
        applyEnvironmentStatus(status)
      })
      .catch((error) => {
        applyEnvironmentStatus({
          modelId: activeModel.id,
          family: activeModel.id === 'bertopic' ? 'bertopic' : 'spatial',
          status: 'error',
          activeBackend: 'browser',
          message: error instanceof Error ? error.message : '环境检测失败，将使用浏览器内置估计。',
          checkedAt: new Date().toISOString(),
        })
      })

    return () => {
      cancelled = true
    }
  }, [activeModel.id, activeModelUsesProfessionalBackend, environmentCheckNonce])

  useEffect(
    () => () => {
      runCancelRef.current = true
      runWorkerRef.current?.terminate()
    },
    [],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(layoutStorageKey, JSON.stringify({ historyCollapsed: isHistoryCollapsed }))
    } catch {
      // Layout preferences are best-effort; analysis data should never depend on them.
    }
  }, [isHistoryCollapsed])

  useEffect(() => {
    try {
      window.localStorage.setItem(modelUsageStorageKey, JSON.stringify(modelUsage))
    } catch {
      // Usage ranking is best-effort and should not block analysis.
    }
  }, [modelUsage])

  const sanitizedConfig = useMemo(
    () => activeModel.sanitizeConfig(modelConfig, eligibleFeatureColumns, numericColumns),
    [activeModel, eligibleFeatureColumns, modelConfig, numericColumns],
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
        modelId: activeModel.id,
        fileName,
        rowCount: rows.length,
        fields: profiles.map((profile) => [profile.name, profile.type, profile.missing, profile.unique]),
        dataRoles,
        prepConfig,
        inference: activeModel.supportsInference ? effectiveInference : undefined,
        config: sanitizedConfig,
      }),
    [activeModel.id, activeModel.supportsInference, dataRoles, effectiveInference, fileName, prepConfig, profiles, rows.length, sanitizedConfig],
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

      if (!hasDataset) return [{ level: 'info', message: '请先导入 CSV 或 XLSX 数据。' }]

      if (runTask?.status === 'cancelled' && runState.signature === currentRunSignature) return runState.logs

      if (result || modelError) return runState.logs

      if (hasStaleResult) {
        return [
          { level: 'warning', message: '模型、参数或数据已变更，当前结果已过期。请点击运行模型更新。' },
          ...runState.logs,
        ]
      }

      return [{ level: 'info', message: '参数设置完成后，点击运行模型开始计算。' }]
    },
	    [currentRunSignature, hasDataset, hasStaleResult, isModelRunning, modelError, result, runState.logs, runState.signature, runStatus, runTask],
	  )
  const publicationSources = useMemo(() => {
    const currentSource =
      result && sanitizedConfig
        ? [
            {
              id: 'current',
              label: `当前结果 · ${activeModel.name}`,
              result,
              config: sanitizedConfig,
              dimensions: dataRoles,
              modelName: activeModel.name,
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
        formula: snapshot.formula,
        createdAt: snapshot.savedResultAt ?? snapshot.createdAt,
      }))

    return [...currentSource, ...snapshotSources]
  }, [activeModel, dataRoles, result, sanitizedConfig, snapshots])
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
  const effectiveCustomPublicationSourceIds = useMemo(
    () => (customPublicationConfig.selectedSourceIds.length > 0 ? customPublicationConfig.selectedSourceIds : publicationSources.slice(0, 6).map((source) => source.id)),
    [customPublicationConfig.selectedSourceIds, publicationSources],
  )
  const customPublicationSelectedSet = useMemo(() => new Set(effectiveCustomPublicationSourceIds), [effectiveCustomPublicationSourceIds])
  const customPublicationEnabled = selectedExportItemSet.has('custom-publication')
  const primaryDiagnostic = result?.diagnostics.find((diagnostic) => diagnostic.kind === 'actual-vs-fitted')
  const correlationMatrix = result?.diagnostics.find((diagnostic) => diagnostic.kind === 'correlation-matrix')
  const error = uploadError || modelError
  const modelOrder = useMemo(() => new Map(modelPlugins.map((plugin, index) => [plugin.id, index])), [])
  const modelCategories = useMemo(
    () => [allModelCategory, ...modelCategoryOrder.filter((category) => modelPlugins.some((plugin) => getModelCategory(plugin) === category))],
    [],
  )
  const filteredModelPlugins = useMemo(() => {
    const query = modelSearch.trim().toLowerCase()
    const categoryFiltered =
      selectedModelCategory === allModelCategory
        ? modelPlugins
        : modelPlugins.filter((plugin) => getModelCategory(plugin) === selectedModelCategory)
    const matched = query
      ? categoryFiltered.filter((plugin) =>
          [plugin.name, plugin.shortName, plugin.fullName, getModelCategory(plugin), plugin.description, ...plugin.keywords]
            .join(' ')
            .toLowerCase()
            .includes(query),
        )
      : categoryFiltered

    return [...matched].sort((left, right) => {
      if (left.id === activeModel.id) return -1
      if (right.id === activeModel.id) return 1
      const leftUsage = modelUsage[left.id]
      const rightUsage = modelUsage[right.id]
      const lastUsedDelta = new Date(rightUsage?.lastUsedAt ?? 0).getTime() - new Date(leftUsage?.lastUsedAt ?? 0).getTime()
      if (lastUsedDelta !== 0) return lastUsedDelta
      const countDelta = (rightUsage?.usedCount ?? 0) - (leftUsage?.usedCount ?? 0)
      if (countDelta !== 0) return countDelta
      return (modelOrder.get(left.id) ?? 0) - (modelOrder.get(right.id) ?? 0)
    })
  }, [activeModel.id, modelOrder, modelSearch, modelUsage, selectedModelCategory])
  const recentModelPlugins = useMemo(
    () =>
      modelPlugins
        .filter((plugin) => plugin.id !== activeModel.id && modelUsage[plugin.id]?.lastUsedAt)
        .sort((left, right) => new Date(modelUsage[right.id]?.lastUsedAt ?? 0).getTime() - new Date(modelUsage[left.id]?.lastUsedAt ?? 0).getTime())
        .slice(0, 5),
    [activeModel.id, modelUsage],
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
  }, [activeModel, effectiveInference.clusterField, hasDataset, inferenceConfig.standardError, rows, sanitizedConfig, selectedFeatures.length, selectedTarget])
  const validationErrors = validationIssues.filter((issue) => issue.level === 'error')
  const resultInsights = useMemo(() => {
    if (!result) return []

    const insights: string[] = []
    const mainTable = result.tables.find((table) => table.id === 'coefficients') ?? result.tables[0]
    const rSquared = extractMetricNumber(result, 'R-squared')
    if (rSquared !== null) insights.push(`模型解释度 R-squared 为 ${formatNumber(rSquared, 3)}。`)
    const pValue = extractMetricNumber(result, 'p-value') ?? extractMetricNumber(result, 'Prob > F') ?? extractMetricNumber(result, 'Sobel p')
    if (pValue !== null) insights.push(pValue < 0.05 ? `核心检验 p 值为 ${formatResultValue(pValue, 'pValue')}，达到常用 5% 显著性阈值。` : `核心检验 p 值为 ${formatResultValue(pValue, 'pValue')}，未达到常用 5% 显著性阈值。`)
    if (mainTable?.rows.length) {
      insights.push(`主结果表「${mainTable.title}」包含 ${mainTable.rows.length} 行结果，可进一步查看具体字段。`)
    }

    return insights.slice(0, 3)
  }, [result])
  const nextAction = useMemo(() => {
    if (!hasDataset) return '下一步：导入 CSV 或 XLSX 数据。'
    if (dataRoles.idFields.length === 0 && !dataRoles.timeField && dataRoles.groupFields.length === 0) return '建议：设置 ID / Time / Group，用于面板数据判断和聚类字段推荐。'
    if (validationErrors.length > 0) return `请先处理：${validationErrors[0].message}`
    if (isModelRunning) return runTask?.phase || '模型正在运行，参数已临时锁定。'
    if (hasStaleResult) return '参数已经变更，建议重新运行模型刷新结果。'
    if (!result) return '参数已就绪，可以运行模型。'
    return '结果已生成，可以查看结果表、诊断信息或导出 CSV。'
  }, [dataRoles.groupFields.length, dataRoles.idFields.length, dataRoles.timeField, hasDataset, hasStaleResult, isModelRunning, result, runTask?.phase, validationErrors])
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

  const applyRows = (nextRows: Row[], nextFileName: string, nextDataRoles = emptyDataRoles) => {
    const cleaned = nextRows.filter((row) => Object.values(row).some((value) => value !== null && value !== ''))
    if (cleaned.length === 0) {
      setUploadError('文件没有可读取的数据。')
      return
    }

    const nextProfiles = profileRows(cleaned)
    const nextDimensionColumns = new Set([...nextDataRoles.idFields, nextDataRoles.timeField, ...nextDataRoles.groupFields].filter(Boolean))
    const nextModelProfiles = nextProfiles.filter((profile) => !nextDimensionColumns.has(profile.name))
    const nextFeatureProfiles = activeModel.includeDimensionFields ? nextProfiles : nextModelProfiles
    const nextNumeric = nextModelProfiles.filter((profile) => profile.type === 'numeric').map((profile) => profile.name)
    const nextFeatureColumns = getFeatureColumnsForPlugin(activeModel, nextFeatureProfiles, prepConfig.categoricalEncoding)
    setRows(cleaned)
    setFileName(nextFileName)
    setDataRoles(nextDataRoles)
    setModelConfig(activeModel.getDefaultConfig(nextFeatureColumns, nextNumeric))
    setTypeOverrides({})
    setUploadError('')
  }

  const openImportWizard = (nextRows: Row[], nextFileName: string) => {
    const cleaned = nextRows.filter((row) => Object.values(row).some((value) => value !== null && value !== ''))
    if (cleaned.length === 0) {
      setUploadError('文件没有可读取的数据。')
      return
    }

    setPendingImport({
      fileName: nextFileName,
      rows: cleaned,
      roles: inferDataRoles(cleaned),
    })
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
    const nextFeatureProfiles = nextModel.includeDimensionFields ? profiles : modelProfiles
    const nextFeatureColumns = getFeatureColumnsForPlugin(nextModel, nextFeatureProfiles, prepConfig.categoricalEncoding)
    setActiveModelId(nextModel.id)
    setModelConfig(nextModel.getDefaultConfig(nextFeatureColumns, numericColumns))
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
  }

  const installProfessionalDependencies = (scope: ProfessionalInstallScope) => {
    const installer = window.visualStatsDesktop?.installProfessionalDependencies
    if (!installer || !activeModelUsesProfessionalBackend || professionalInstall.status === 'installing') return

    const scopeLabel = scope === 'professional' ? '完整专业依赖' : '轻量依赖'
    const confirmed = window.confirm(`将使用当前 Python 环境安装${scopeLabel}，安装过程可能需要联网并持续数分钟。是否继续？`)
    if (!confirmed) return

    setProfessionalInstall({ status: 'installing', scope, message: `正在安装${scopeLabel}，请保持客户端打开。` })
    installer({ modelId: activeModel.id, scope })
      .then((response) => {
        if (response.success) {
          setProfessionalInstall({
            status: 'success',
            scope,
            message: response.message || `${scopeLabel}安装完成，正在重新检测环境。`,
            stdout: response.stdout,
            stderr: response.stderr,
            missingAfterInstall: response.missingAfterInstall,
          })
          setEnvironmentCheckNonce((current) => current + 1)
          return
        }
        setProfessionalInstall({
          status: 'error',
          scope,
          message: response.message || `${scopeLabel}安装失败。`,
          stdout: response.stdout,
          stderr: response.stderr,
          missingAfterInstall: response.missingAfterInstall,
        })
      })
      .catch((error) => {
        setProfessionalInstall({
          status: 'error',
          scope,
          message: error instanceof Error ? error.message : `${scopeLabel}安装失败。`,
        })
      })
  }

  const handleRunModel = () => {
    if (!hasDataset || isModelRunning) return
    if (validationErrors.length > 0) {
      setRunState({
        result: null,
        error: '参数未通过运行前检查，请先修正参数面板中的错误。',
        logs: validationErrors.map((issue) => ({ level: 'warning' as const, message: issue.message })),
        signature: currentRunSignature,
      })
      return
    }

    setUploadError('')
    runWorkerRef.current?.terminate()
    runCancelRef.current = false
    const taskId = `${Date.now()}-${activeModel.id}`
    const estimatedMs = estimateRunDuration(activeModel.id, rows.length)
    setIsModelRunning(true)
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
              elapsedMs: Date.now() - current.startedAt,
            }
          : current,
      )
      setIsModelRunning(false)
      setRunStatus('')
      runWorkerRef.current = null
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

    const professionalRunner = window.visualStatsDesktop?.runProfessionalModel
    const shouldTryProfessionalBackend = Boolean(professionalRunner) && (professionalBackendModelIds.has(activeModel.id) || activeModel.id.startsWith('spatial-'))

    if (professionalRunner && shouldTryProfessionalBackend) {
      updateRunTask('estimating', '调用本地 Python 专业后端。', 32)
      professionalRunner({
        taskId,
        modelId: activeModel.id,
        rows,
        config: sanitizedConfig,
        inference: activeModel.supportsInference ? effectiveInference : undefined,
      })
        .then((response) => {
          if (runCancelRef.current) return
          if (response.error || !response.result) {
            throw new Error(response.error || '专业后端没有返回模型结果。')
          }
          completeRun(response.result, [
            { level: 'info', message: `已使用 ${response.backend ?? 'Python'} 专业后端。` },
            ...(response.logs ?? []),
          ])
        })
        .catch((error) => {
          if (runCancelRef.current) return
          const reason = error instanceof Error ? error.message : '专业后端不可用。'
          updateRunTask('estimating', '专业后端不可用，切换浏览器内置估计。', 42)
          startBrowserWorker([{ level: 'warning', message: `专业后端不可用，已自动降级为浏览器估计：${reason}` }])
        })
      return
    }

    startBrowserWorker()
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
    if (!hasDataset) return

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
    setSelectedSnapshotIds((current) => (current.length === sortedSnapshots.length ? [] : sortedSnapshots.map((snapshot) => snapshot.id)))
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

  const setParamColumn = (paramId: string, value: string) => {
    setModelConfig((current) => ({
      ...current,
      params: {
        ...current.params,
        [paramId]: value,
      },
    }))
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

      return {
        ...current,
        params: {
          ...current.params,
          [paramId]: nextValues,
        },
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

  const buildPublicationRegressionTable = () => {
    if (!result) return null
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

  const buildCustomPublicationTableFromConfig = () => {
    const selectedIds = effectiveCustomPublicationSourceIds
    const selectedSet = new Set(selectedIds)
    const sources: CustomPublicationSource[] = publicationSources
      .filter((source) => selectedSet.has(source.id))
      .map((source, index) => {
        const draft = customPublicationConfig.columns[source.id]
        return {
          id: source.id,
          result: source.result,
          config: source.config,
          dimensions: source.dimensions,
          label: draft?.label || `(${index + 1})`,
          group: draft?.group?.trim() || undefined,
          modelLabel: draft?.modelLabel?.trim() || source.modelName,
        }
      })

    return buildCustomPublicationTable({
      title: customPublicationConfig.title,
      note: customPublicationConfig.note,
      sources,
    })
  }

  const updateCustomPublicationConfig = (patch: Partial<Pick<CustomPublicationConfig, 'title' | 'note'>>) => {
    setCustomPublicationConfig((current) => ({ ...current, ...patch }))
  }

  const toggleCustomPublicationSource = (sourceId: string) => {
    setCustomPublicationConfig((current) => {
      const baseSelected = current.selectedSourceIds.length > 0 ? current.selectedSourceIds : publicationSources.slice(0, 6).map((source) => source.id)
      const selected = baseSelected.includes(sourceId)
        ? baseSelected.filter((id) => id !== sourceId)
        : [...baseSelected, sourceId]
      return { ...current, selectedSourceIds: selected }
    })
  }

  const updateCustomPublicationColumn = (sourceId: string, patch: Partial<Omit<CustomPublicationColumnDraft, 'id'>>) => {
    setCustomPublicationConfig((current) => ({
      ...current,
      columns: {
        ...current.columns,
        [sourceId]: {
          id: sourceId,
          label: current.columns[sourceId]?.label ?? `(${Object.keys(current.columns).length + 1})`,
          group: current.columns[sourceId]?.group ?? '',
          modelLabel: current.columns[sourceId]?.modelLabel ?? '',
          ...patch,
        },
      },
    }))
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

  const buildPublicationTableHtml = (table: PublicationTable) => {
    const publicationRows = publicationTableToRows(table, { includeNotes: true })
    const note = publicationRows.at(-1)?.[0] ?? ''
    const rows = publicationRows
      .slice(0, -1)
      .map((row, rowIndex) => {
        const cells = row.map((cell, cellIndex) => {
          const role = table.rows[rowIndex]?.role
          const tag = role === 'title' || role === 'model' || role === 'header' ? 'th' : 'td'
          return `<${tag}${cellIndex === 0 ? ' class="row-label"' : ''}>${escapeXml(cell)}</${tag}>`
        })
        return `<tr>${cells.join('')}</tr>`
      })
      .join('')

    return `<h2>${escapeXml(table.title)}</h2><table class="three-line"><tbody>${rows}</tbody></table><p class="note">${escapeXml(note)}</p>`
  }

  const buildThreeLineTable = (selectedIds = getExportSelection()) => {
    if (!result || !selectedIds.includes('three-line')) return ''
    const table = buildPublicationRegressionTable()
    return table ? buildPublicationTableHtml(table) : ''
  }

  const buildHtmlReport = (selectedIds = getExportSelection()) => {
    if (!result) return ''
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
body{font-family:Arial,sans-serif;color:#1a1f26;margin:28px;line-height:1.5}h1{font-size:22px}h2{font-size:16px;margin-top:22px}table{border-collapse:collapse;width:100%;margin:8px 0 14px}th,td{border:1px solid #d9ddd6;padding:6px 8px;font-size:12px;text-align:left}th{background:#f4f6f2}.three-line th,.three-line td{border-left:0;border-right:0;text-align:center}.three-line .row-label{text-align:left}.three-line tr:last-child td{border-bottom:2px solid #1a1f26}.note{margin-top:-6px;font-size:12px;color:#66706b}code{white-space:pre-wrap}
</style></head><body><h1>${escapeXml(activeModel.name)}（${escapeXml(activeModel.shortName)}）</h1><p><strong>公式：</strong><code>${escapeXml(activeModel.getFormula(sanitizedConfig))}</code></p><p><strong>可信度：</strong>${escapeXml(modelMaturity.label)} · ${escapeXml(modelMaturity.description)}</p>${summaryRows}${buildStataStyleTable(selectedIds)}${buildThreeLineTable(selectedIds)}${customPublicationHtml}${tableHtml}${logRows}${configBlock}</body></html>`
  }

  const buildExcelBlob = async (selectedIds = getExportSelection()) => {
    if (!result) return new Blob([])
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
    const excelCell = (
      value: string | number,
      style: Partial<Extract<Cell, { value?: unknown }>> = {},
    ): Cell => ({
      value,
      type: typeof value === 'number' ? Number : String,
      align: typeof value === 'number' ? 'right' : 'left',
      ...style,
    })
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
          const isHeader = role === 'title' || role === 'model' || role === 'header'
          const isLastTableRow = rowIndex === table.rows.length - 1
          return excelCell(cell, {
            fontFamily: 'Times New Roman',
            fontSize: 11,
            fontWeight: isHeader ? 'bold' : undefined,
            align: role === 'title' || columnIndex > 0 ? 'center' : 'left',
            wrap: true,
            columnSpan: mergeStarts.get(`${rowIndex}:${columnIndex}`),
            topBorderStyle: role === 'title' || role === 'header' ? 'thin' : undefined,
            bottomBorderStyle: isLastTableRow ? 'medium' : role === 'title' || role === 'header' ? 'thin' : undefined,
          })
        }),
      )
    }
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
      sheets.push({
        sheet: worksheetName(table.sheetName),
        data: publicationSheetData(table),
        columns: Array.from({ length: columnCount }, (_, columnIndex) => ({ width: columnIndex === 0 ? 18 : 13 })),
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
    if (!result) return ''
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
    if (!result) return
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
    setSelectedExportItemIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
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
    const uniqueOptions = Array.from(new Set(options)).filter((column) => field.role === 'target' || column !== selectedTarget)

    if (field.kind === 'column') {
      return (
        <label className="control-group" key={field.id}>
          <span>{field.label}</span>
          <select
            value={asParamString(sanitizedConfig.params?.[field.id])}
            disabled={isModelRunning}
            onChange={(event) => setParamColumn(field.id, event.target.value)}
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Visual Stats Lab</span>
          <h1>可视化统计建模工作台</h1>
        </div>
        <div className="topbar__actions">
          <button className="secondary-button" type="button" onClick={() => setIsDataModalOpen(true)} disabled={!hasDataset}>
            <Table size={16} />
            查看数据表
          </button>
          <label className="icon-button" title="上传 CSV 或 XLSX">
            <Upload size={17} />
            <input
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                handleUpload(event.target.files?.[0])
                event.currentTarget.value = ''
              }}
            />
          </label>
          <button className="primary-button" type="button" onClick={handleRunModel} disabled={!hasDataset || isModelRunning || validationErrors.length > 0}>
            <Play size={16} />
            {isModelRunning ? '运行中' : '运行模型'}
          </button>
        </div>
      </header>

      <section className={`workspace ${isHistoryCollapsed ? 'is-history-collapsed' : ''}`}>
        <aside className={`panel data-panel ${isHistoryCollapsed ? 'is-collapsed' : ''}`}>
          <div className="panel__header">
            <div>
              <span className="panel__label">Workspace</span>
              <h2>历史记录</h2>
            </div>
            <button
              className="snapshot-icon-button"
              type="button"
              title={isHistoryCollapsed ? '展开历史记录' : '折叠历史记录'}
              onClick={() => setIsHistoryCollapsed((current) => !current)}
            >
              <History size={18} />
            </button>
          </div>

          <div className="history-panel-content">
          <div className="dataset-card">
            <span className="dataset-card__label">当前数据集</span>
            <strong>{fileName || '尚未导入数据'}</strong>
            <p>{hasDataset ? `${rows.length} 行 · ${profiles.length} 字段 · ${eligibleFeatureColumns.length} 个当前模型候选字段` : '导入 CSV 或 XLSX 后开始分析。'}</p>
            {hasDataset ? (
              <div className="role-summary">
                <span title={summarizeFields(dataRoles.idFields)}>ID {summarizeFields(dataRoles.idFields)}</span>
                <span title={dataRoles.timeField || '未设置'}>Time {dataRoles.timeField || '未设置'}</span>
                <span title={summarizeFields(dataRoles.groupFields)}>Group {summarizeFields(dataRoles.groupFields)}</span>
              </div>
            ) : null}
            <button className="secondary-button is-full" type="button" onClick={() => setIsDataModalOpen(true)} disabled={!hasDataset}>
              <Table size={15} />
              查看数据表
            </button>
          </div>

          <div className="metrics-strip">
            <span>
              <strong>{rows.length}</strong>
              rows
            </span>
            <span>
              <strong>{profiles.length}</strong>
              fields
            </span>
            <span>
              <strong>{eligibleFeatureColumns.length}</strong>
              model fields
            </span>
          </div>

          <div className="snapshot-toolbar">
            <button className="primary-button is-full" type="button" onClick={saveSnapshot} disabled={!hasDataset}>
              <Save size={15} />
              保存当前数据
            </button>
            <button
              className="secondary-button is-full"
              type="button"
              onClick={() => {
                setIsSnapshotManageMode((current) => !current)
                setSelectedSnapshotIds([])
              }}
              disabled={snapshots.length === 0}
            >
              {isSnapshotManageMode ? <Check size={15} /> : <SlidersHorizontal size={15} />}
              {isSnapshotManageMode ? '完成管理' : '批量管理'}
            </button>
          </div>

          {isSnapshotManageMode ? (
            <div className="snapshot-batchbar">
              <button className="secondary-button" type="button" onClick={toggleAllSnapshots}>
                {selectedSnapshotIds.length === sortedSnapshots.length ? '取消全选' : '全选'}
              </button>
              <span>{selectedSnapshotIds.length} 已选</span>
              <button className="secondary-button is-danger" type="button" onClick={deleteSelectedSnapshots} disabled={selectedSnapshotIds.length === 0}>
                <Trash2 size={14} />
                删除
              </button>
            </div>
          ) : null}

          <div className="snapshot-list">
            {snapshots.length === 0 ? (
              <div className="empty-history">
                <History size={17} />
                保存一次当前配置后，可以从这里快速回到当时的模型和数据状态。
              </div>
            ) : (
              sortedSnapshots.map((snapshot) => (
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
                        </span>
                      </button>
                      <div className="snapshot-actions">
                        <button
                          className={`snapshot-icon-button ${snapshot.favorite ? 'is-active' : ''}`}
                          type="button"
                          title={snapshot.favorite ? '取消收藏' : '收藏'}
                          onClick={() => toggleSnapshotFlag(snapshot.id, 'favorite')}
                        >
                          <Star size={14} />
                        </button>
                        <button
                          className={`snapshot-icon-button ${snapshot.pinned ? 'is-active' : ''}`}
                          type="button"
                          title={snapshot.pinned ? '取消置顶' : '置顶'}
                          onClick={() => toggleSnapshotFlag(snapshot.id, 'pinned')}
                        >
                          <Pin size={14} />
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
                    <small>
                      {snapshot.pinned ? '置顶 · ' : ''}
                      {snapshot.favorite ? '收藏 · ' : ''}
                      {snapshot.rowCount} 行 · {snapshot.fieldCount} 字段{snapshot.result ? ' · 含模型结果' : ''}
                    </small>
                  </button>
                </article>
              ))
            )}
          </div>
          </div>
        </aside>

        <section className="main-stage">
          {!hasDataset ? (
            <section className="empty-workbench">
              <div className="empty-workbench__icon">
                <Database size={26} />
              </div>
              <span className="panel__label">Start</span>
              <h2>导入数据开始分析</h2>
              <p>支持 CSV 和 XLSX。导入后会先进入字段角色向导，设置 ID、Time、Group 并自动完成面板数据体检。</p>
              <label className="primary-button import-cta">
                <Upload size={16} />
                导入数据
                <input
                  type="file"
                  accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => {
                    handleUpload(event.target.files?.[0])
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </section>
          ) : (
            <>
              <section className="report-header">
                <div>
                  <span className="panel__label">Active model</span>
                  <h2>
                    {activeModel.name}（{activeModel.shortName}）
                  </h2>
                  <code>{activeModel.getFormula(sanitizedConfig)}</code>
                </div>
                <button className="primary-button" type="button" onClick={openExportDialog} disabled={!result}>
                  <Download size={15} />
                  导出结果
                </button>
              </section>

              <section className="action-guide" aria-label="当前建议动作">
                <span>当前建议</span>
                <strong>{nextAction}</strong>
              </section>

              <section className={`run-status-card ${isModelRunning ? 'is-running' : hasStaleResult ? 'is-stale' : result ? 'is-ready' : ''}`}>
                <div>
                  <strong>
                    {isModelRunning
                      ? `模型运行中 · ${runTask?.modelName ?? activeModel.name}`
                      : runTask?.status === 'cancelled'
                        ? '任务已取消'
                      : hasStaleResult
                        ? '参数已变更'
                      : result
                        ? '结果已更新'
                        : '等待运行'}
                  </strong>
                  <p>
                    {isModelRunning
                      ? runTask?.phase || runStatus || '正在估计模型。'
                      : runTask?.status === 'cancelled'
                        ? '本次任务已取消，可以调整参数后重新运行。'
                      : validationErrors.length > 0
                        ? '参数面板存在必须修正的问题，处理后才能运行模型。'
                      : hasStaleResult
                        ? '模型、参数、标准误或数据角色发生变化，请重新运行以刷新结果。'
                        : result
                          ? '当前展示的是最新一次运行结果。'
                          : '设置模型参数后点击运行模型，结果区才会开始计算。'}
                  </p>
                  {isModelRunning && runTask ? (
                    <div className="run-task-progress" aria-label="模型运行进度">
                      <div>
                        <span>{runTask.progress}%</span>
                        <span>
                          已用 {formatDuration(runTask.elapsedMs)} / 预计 {formatDuration(runTask.estimatedMs)}
                        </span>
                      </div>
                      <progress value={runTask.progress} max={100} />
                    </div>
                  ) : null}
                </div>
                <div className="run-status-actions">
                  {isModelRunning ? (
                    <button className="secondary-button" type="button" onClick={cancelRunTask}>
                      <X size={15} />
                      取消运行
                    </button>
                  ) : null}
                  <button className="primary-button" type="button" onClick={handleRunModel} disabled={!hasDataset || isModelRunning || validationErrors.length > 0}>
                    <Play size={15} />
                    {validationErrors.length > 0 ? '需调整参数' : hasStaleResult ? '更新结果' : runTask?.status === 'cancelled' ? '重新运行' : '运行模型'}
                  </button>
                </div>
              </section>

              <section className="panel-diagnosis">
                <div className="section-title">
                  <Activity size={18} />
                  <h2>数据体检</h2>
                </div>
                <div className={`diagnosis-card is-${panelDiagnosis.status}`}>
                  <div>
                    <strong>{panelDiagnosis.title}</strong>
                    <p>{panelDiagnosis.summary}</p>
                  </div>
                  <div className="diagnosis-metrics">
                    <span>
                      <strong>{panelDiagnosis.idCount}</strong>
                      ID
                    </span>
                    <span>
                      <strong>{panelDiagnosis.timeCount}</strong>
                      Time
                    </span>
                    <span>
                      <strong>{panelDiagnosis.expectedObservations}</strong>
                      理论观测
                    </span>
                    <span>
                      <strong>{panelDiagnosis.actualObservations}</strong>
                      有效观测
                    </span>
                    <span>
                      <strong>{panelDiagnosis.missingCombinations}</strong>
                      缺失组合
                    </span>
                    <span>
                      <strong>{panelDiagnosis.duplicateCombinations}</strong>
                      重复组合
                    </span>
                  </div>
                  {panelDiagnosis.examples.length > 0 ? (
                    <div className="diagnosis-reasons">
                      {panelDiagnosis.examples.map((example) => (
                        <p key={example}>{example}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="results-workspace">
                <div className="result-panel result-primary-panel">
                  <div className="result-primary-header">
                    <div className="section-title">
                      <Activity size={18} />
                      <h2>模型摘要与回归结果</h2>
                    </div>
	                    <div className="export-actions">
	                      <button className="ghost-button" type="button" onClick={openExportDialog} disabled={!result} title="选择格式和导出内容">
	                        导出
	                      </button>
	                    </div>
                  </div>

                  <div className="result-primary-summary">
                    {isModelRunning ? (
                      <div className="notice is-running-task">
                        <Activity size={18} />
                        <div>
                          <strong>{runTask?.phase || runStatus || '正在运行模型。'}</strong>
                          {runTask ? (
                            <span>
                              {runTask.progress}% · 已用 {formatDuration(runTask.elapsedMs)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : error ? (
                      <div className="notice is-error">
                        <AlertTriangle size={18} />
                        {error}
                      </div>
                    ) : result ? (
                      <>
                        <div className="summary-grid is-compact">
                          {result.summary.slice(0, 6).map((metric) => (
                            <span key={metric.label}>
                              <strong>{formatMetricValue(metric)}</strong>
                              {metric.label}
                            </span>
                          ))}
                        </div>
                        {resultInsights.length > 0 ? (
                          <div className="result-insights is-inline">
                            <strong>
                              模型可信度：{modelMaturity.label} · {activeModel.methodLabel}
                            </strong>
                            <p>{modelMaturity.description}</p>
                            {activeModel.limitations?.slice(0, 2).map((limitation) => (
                              <p key={limitation}>{limitation}</p>
                            ))}
                            {resultInsights.map((insight) => (
                              <p key={insight}>{insight}</p>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="notice">
                        {runTask?.status === 'cancelled' ? <X size={18} /> : <Play size={18} />}
                        {runTask?.status === 'cancelled' ? '本次模型任务已取消，结果未更新。' : hasStaleResult ? '参数已变更，点击运行模型刷新结果。' : '点击运行模型后展示摘要和结果表。'}
                      </div>
                    )}
                  </div>

                  <div className="result-tables">
                    {mainResultTable ? (
                      <div className="coef-table is-primary" key={mainResultTable.id}>
                        <div className="table-caption">{mainResultTable.title}</div>
                        <div
                          className="coef-table__head"
                          style={{ gridTemplateColumns: `repeat(${mainResultTable.columns.length}, minmax(${mainResultTable.columns.length > 9 ? 56 : 0}px, 1fr))` }}
                        >
                          {mainResultTable.columns.map((column) => (
                            <span key={column}>{columnLabels[column] ?? column}</span>
                          ))}
                        </div>
                        {mainResultTable.rows.map((row, rowIndex) => (
                          <div
                            className="coef-table__row"
                            key={`${row.term ?? row.variable ?? row.source ?? rowIndex}`}
                            style={{ gridTemplateColumns: `repeat(${mainResultTable.columns.length}, minmax(${mainResultTable.columns.length > 9 ? 56 : 0}px, 1fr))` }}
                          >
                            {mainResultTable.columns.map((column, columnIndex) => (
                              <span className={columnIndex === 0 ? 'coef-table__term' : ''} key={column}>
                                {formatResultValue(row[column] ?? '', column)}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {secondaryResultTables.length > 0 ? (
                      <div className="result-secondary-tables">
                        {secondaryResultTables.map((table) => (
                          <div className="coef-table is-secondary" key={table.id}>
                            <div className="table-caption">
                              {table.title}
                              <span>{table.rows.length} 行</span>
                            </div>
                            <div
                              className="coef-table__head"
                              style={{ gridTemplateColumns: `repeat(${table.columns.length}, minmax(${table.columns.length > 8 ? 50 : 0}px, 1fr))` }}
                            >
                              {table.columns.map((column) => (
                                <span key={column}>{columnLabels[column] ?? column}</span>
                              ))}
                            </div>
                            {table.rows.map((row, rowIndex) => (
                              <div
                                className="coef-table__row"
                                key={`${row.term ?? row.variable ?? row.source ?? row.model ?? rowIndex}`}
                                style={{ gridTemplateColumns: `repeat(${table.columns.length}, minmax(${table.columns.length > 8 ? 50 : 0}px, 1fr))` }}
                              >
                                {table.columns.map((column, columnIndex) => (
                                  <span className={columnIndex === 0 ? 'coef-table__term' : ''} key={column}>
                                    {formatResultValue(row[column] ?? '', column)}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!result ? (
                      <div className="empty-diagnostic">
                        <Table size={18} />
                        运行模型后展示回归结果。
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="result-support-row">
                  <div className="result-panel result-diagnostic-card">
                    <div className="section-title">
                      <Activity size={18} />
                      <h2>{primaryDiagnostic?.title ?? correlationMatrix?.title ?? '拟合诊断'}</h2>
                    </div>
                    {primaryDiagnostic ? (
                      <div className="scatter-plot is-compact" aria-label="Actual versus fitted chart">
                        {primaryDiagnostic.actual.map((actual, index) => {
                          const maxActual = Math.max(...primaryDiagnostic.actual)
                          const maxFitted = Math.max(...primaryDiagnostic.fitted)
                          return (
                            <span
                              key={`${actual}-${index}`}
                              style={{
                                left: `${(primaryDiagnostic.fitted[index] / maxFitted) * 88 + 5}%`,
                                bottom: `${(actual / maxActual) * 80 + 8}%`,
                              }}
                            />
                          )
                        })}
                      </div>
                    ) : correlationMatrix ? (
                      <div
                        className="correlation-heatmap is-compact"
                        style={{ gridTemplateColumns: `72px repeat(${correlationMatrix.variables.length}, minmax(42px, 1fr))` }}
                      >
                        <span />
                        {correlationMatrix.variables.map((variable) => (
                          <strong key={variable}>{variable}</strong>
                        ))}
                        {correlationMatrix.matrix.flatMap((row, rowIndex) => [
                          <strong className="correlation-heatmap__row-label" key={`${correlationMatrix.variables[rowIndex]}-label`}>
                            {correlationMatrix.variables[rowIndex]}
                          </strong>,
                          ...row.map((value, columnIndex) => (
                            <span
                              key={`${correlationMatrix.variables[rowIndex]}-${correlationMatrix.variables[columnIndex]}`}
                              style={{
                                backgroundColor:
                                  value >= 0
                                    ? `rgba(23, 124, 120, ${Math.min(Math.abs(value), 1) * 0.78 + 0.08})`
                                    : `rgba(187, 69, 54, ${Math.min(Math.abs(value), 1) * 0.72 + 0.08})`,
                                color: Math.abs(value) > 0.62 ? '#ffffff' : 'var(--ink)',
                              }}
                            >
                              {formatNumber(value, 2)}
                            </span>
                          )),
                        ])}
                      </div>
                    ) : (
                      <div className="empty-diagnostic is-compact">
                        <Activity size={18} />
                        暂无诊断图。
                      </div>
                    )}
                  </div>

                  <div className="result-panel result-log-card">
                    <div className="section-title">
                      <Activity size={18} />
                      <h2>运行日志</h2>
                    </div>
                    <div className="run-log is-expanded">
                      {runLogs.map((entry, index) => (
                        <p className={entry.level === 'warning' ? 'is-warning' : ''} key={`${entry.message}-${index}`}>
                          {entry.message}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </section>

        <aside className="panel config-panel">
          <div className="panel__header">
            <div>
              <span className="panel__label">{activeModel.panelLabel}</span>
              <h2>参数面板</h2>
            </div>
            <Settings size={18} />
          </div>

          <div className="active-model-card">
            <div className="active-model-card__header">
              <span>{getModelCategory(activeModel)}</span>
              <button className="secondary-button" type="button" onClick={() => setIsModelLibraryOpen(true)} disabled={isModelRunning}>
                <Search size={15} />
                选择模型
              </button>
            </div>
            <div className="active-model-card__title">
              <strong>
                {activeModel.name}（{activeModel.shortName}）
              </strong>
              <small>{activeModel.fullName}</small>
            </div>
            <small className="model-description">{activeModel.description}</small>
            <div className="model-use-case">
              <strong>适用场景</strong>
              <span>{getModelUseCase(activeModel)}</span>
            </div>
            <div className={`model-quality is-${modelMaturity.level}`}>
              <strong>{modelMaturity.label}</strong>
              <span>{modelMaturity.description}</span>
            </div>
            {activeModelUsesProfessionalBackend && professionalEnv ? (
              <div className={`professional-env-card is-${professionalStatusLabels[professionalEnv.status].tone}`}>
                <div className="professional-env-card__header">
                  <span>
                    {professionalEnv.status === 'ready' ? <CheckCircle size={14} /> : professionalEnv.status === 'checking' ? <Activity size={14} /> : <AlertTriangle size={14} />}
                    {professionalStatusLabels[professionalEnv.status].label}
                  </span>
                  <button
                    className="professional-env-card__refresh"
                    type="button"
                    onClick={() => setEnvironmentCheckNonce((current) => current + 1)}
                    disabled={professionalEnv.status === 'checking' || isModelRunning}
                  >
                    {professionalEnv.status === 'checking' ? '检测中' : '重新检测'}
                  </button>
                </div>
                <p>{professionalEnv.message}</p>
                <div className="professional-env-card__meta">
                  <span>
                    <strong>当前路径</strong>
                    {backendLabels[professionalEnv.activeBackend] ?? professionalEnv.activeBackend}
                  </span>
                  <span>
                    <strong>最近检测</strong>
                    {formatCheckTime(professionalEnv.checkedAt)}
                  </span>
                  <span>
                    <strong>Python</strong>
                    {professionalEnv.python?.available ? `${professionalEnv.python.version} · ${professionalEnv.python.path}` : '未检测到'}
                  </span>
                </div>
                {(professionalEnv.missingProfessional?.length ?? 0) > 0 ? (
                  <div className="professional-env-card__missing">
                    <strong>完整专业依赖缺失</strong>
                    <span>{professionalEnv.missingProfessional?.join(', ')}</span>
                  </div>
                ) : null}
                {(professionalEnv.missingLightweight?.length ?? 0) > 0 ? (
                  <div className="professional-env-card__missing">
                    <strong>轻量依赖缺失</strong>
                    <span>{professionalEnv.missingLightweight?.join(', ')}</span>
                  </div>
                ) : null}
                {window.visualStatsDesktop?.installProfessionalDependencies && professionalEnv.status !== 'web' ? (
                  <div className="professional-env-card__actions">
                    {(professionalEnv.missingLightweight?.length ?? 0) > 0 ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => installProfessionalDependencies('lightweight')}
                        disabled={isModelRunning || professionalEnv.status === 'checking' || professionalInstall.status === 'installing'}
                      >
                        安装轻量依赖
                      </button>
                    ) : null}
                    {(professionalEnv.missingProfessional?.length ?? 0) > 0 ? (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => installProfessionalDependencies('professional')}
                        disabled={isModelRunning || professionalEnv.status === 'checking' || professionalInstall.status === 'installing'}
                      >
                        安装完整专业依赖
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {professionalInstall.status !== 'idle' ? (
                  <div className={`professional-install-log is-${professionalInstall.status}`}>
                    <strong>
                      {professionalInstall.status === 'installing'
                        ? '安装中'
                        : professionalInstall.status === 'success'
                          ? '安装完成'
                          : '安装失败'}
                    </strong>
                    <span>{professionalInstall.message}</span>
                    {(professionalInstall.missingAfterInstall?.length ?? 0) > 0 ? (
                      <span>仍缺失：{professionalInstall.missingAfterInstall?.join(', ')}</span>
                    ) : null}
                    {professionalInstall.stderr || professionalInstall.stdout ? <code>{professionalInstall.stderr || professionalInstall.stdout}</code> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {validationIssues.length > 0 ? (
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
            )}
          </div>

          {isModelRunning ? (
            <div className="parameter-lock-notice">
              <Activity size={14} />
              <span>模型运行中，参数已临时锁定。</span>
            </div>
          ) : null}

          {activeModel.parameterSchema ? (
            <div className="parameter-schema">
              {parameterSections.map((section) => (
                <section className="parameter-section" key={section.id}>
                  <div className="parameter-section__header">
                    <strong>{section.title}</strong>
                    <span>{section.description}</span>
                  </div>
                  {section.fields.map(renderParameterField)}
                </section>
              ))}
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

          {activeModel.requiresTarget && !activeModel.usesRawRows && (
            <section className="parameter-section">
              <div className="parameter-section__header">
                <strong>数据处理</strong>
                <span>运行前对缺失值和分类变量进行预处理。</span>
              </div>
            <div className="prep-controls">
              <label className="control-group">
                <span>缺失值处理</span>
                <select
                  value={prepConfig.missingStrategy}
                  disabled={isModelRunning}
                  onChange={(event) =>
                    setPrepConfig((current) => ({
                      ...current,
                      missingStrategy: event.target.value as DataPrepConfig['missingStrategy'],
                    }))
                  }
                >
                  {missingOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="control-group">
                <span>分类变量编码</span>
                <select
                  value={prepConfig.categoricalEncoding}
                  disabled={isModelRunning}
                  onChange={(event) =>
                    setPrepConfig((current) => ({
                      ...current,
                      categoricalEncoding: event.target.value as DataPrepConfig['categoricalEncoding'],
                    }))
                  }
                >
                  <option value="one-hot">One-hot 编码</option>
                  <option value="none">不编码</option>
                </select>
              </label>
            </div>
            </section>
          )}

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
        </aside>
      </section>

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

            {recentModelPlugins.length > 0 && !modelSearch.trim() && selectedModelCategory === allModelCategory ? (
              <div className="recent-model-strip">
                <span>最近使用</span>
                <div>
                  {recentModelPlugins.map((plugin) => (
                    <button type="button" key={plugin.id} onClick={() => switchModel(plugin.id)}>
                      <strong>{plugin.name}</strong>
                      <small>{plugin.shortName}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="model-library-grid">
              {filteredModelPlugins.map((plugin) => (
                <button
                  className={`model-library-card ${plugin.id === activeModel.id ? 'is-active' : ''}`}
                  type="button"
                  key={plugin.id}
                  onClick={() => switchModel(plugin.id)}
                >
                  <span>{getModelCategory(plugin)}</span>
                  <strong>
                    {plugin.name}（{plugin.shortName}）
                  </strong>
                  <small>{plugin.fullName}</small>
                  <p>{getModelUseCase(plugin)}</p>
                </button>
              ))}
              {filteredModelPlugins.length === 0 ? <div className="empty-history">没有匹配的模型插件。</div> : null}
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

                {customPublicationEnabled ? (
                  <div className="custom-publication-panel">
                    <div className="custom-publication-panel__header">
                      <strong>自定义论文表</strong>
                      <span>从当前结果和已保存历史结果中选择列，设置分组、列名和注释。</span>
                    </div>
                    <div className="custom-publication-fields">
                      <label>
                        <span>表名</span>
                        <input
                          value={customPublicationConfig.title}
                          disabled={isExporting}
                          onChange={(event) => updateCustomPublicationConfig({ title: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>注释</span>
                        <textarea
                          value={customPublicationConfig.note}
                          disabled={isExporting}
                          rows={2}
                          onChange={(event) => updateCustomPublicationConfig({ note: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="custom-publication-source-list">
                      {publicationSources.length === 0 ? (
                        <div className="empty-history">暂无可用结果。运行模型或保存带结果的历史记录后可联合导出。</div>
                      ) : (
                        publicationSources.map((source, sourceIndex) => {
                          const draft = customPublicationConfig.columns[source.id] ?? {
                            id: source.id,
                            label: `(${sourceIndex + 1})`,
                            group: '',
                            modelLabel: source.modelName,
                          }
                          return (
                            <div className={`custom-publication-source ${customPublicationSelectedSet.has(source.id) ? 'is-selected' : ''}`} key={source.id}>
                              <label className="custom-publication-source__check">
                                <input
                                  type="checkbox"
                                  checked={customPublicationSelectedSet.has(source.id)}
                                  disabled={isExporting}
                                  onChange={() => toggleCustomPublicationSource(source.id)}
                                />
                                <span>
                                  <strong>{source.label}</strong>
                                  <small>{source.formula}</small>
                                </span>
                              </label>
                              <div className="custom-publication-source__fields">
                                <input
                                  value={draft.group}
                                  placeholder="一级表头分组"
                                  disabled={isExporting || !customPublicationSelectedSet.has(source.id)}
                                  onChange={(event) => updateCustomPublicationColumn(source.id, { group: event.target.value })}
                                />
                                <input
                                  value={draft.label}
                                  placeholder="列名，如 (1)"
                                  disabled={isExporting || !customPublicationSelectedSet.has(source.id)}
                                  onChange={(event) => updateCustomPublicationColumn(source.id, { label: event.target.value })}
                                />
                                <input
                                  value={draft.modelLabel}
                                  placeholder="模型行，如 Fe"
                                  disabled={isExporting || !customPublicationSelectedSet.has(source.id)}
                                  onChange={(event) => updateCustomPublicationColumn(source.id, { modelLabel: event.target.value })}
                                />
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                ) : null}
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
                <div
                  className="data-preview"
                  style={{ gridTemplateColumns: `repeat(${pendingColumns.length}, minmax(110px, 1fr))` }}
                >
                  {pendingColumns.map((column) => (
                    <strong className={hasField(pendingImport.roles, column) ? 'is-dimension-column' : ''} key={column}>
                      {column}
                    </strong>
                  ))}
                  {pendingPreviewRows.flatMap((row, rowIndex) =>
                    pendingColumns.map((column) => (
                      <span className={row[column] === null || row[column] === '' ? 'is-missing' : ''} key={`${rowIndex}-${column}`}>
                        {previewValue(row[column])}
                      </span>
                    )),
                  )}
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
                <div
                  className="data-preview is-virtualized"
                  onScroll={(event) => setDataPreviewScrollTop(event.currentTarget.scrollTop)}
                  style={{ gridTemplateColumns: `repeat(${previewColumns.length}, minmax(120px, 1fr))` }}
                >
                  {previewColumns.map((column) => (
                    <strong className={dimensionColumns.has(column) ? 'is-dimension-column' : ''} key={column}>
                      {column}
                    </strong>
                  ))}
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
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
