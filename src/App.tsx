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
import { formatNumber, profileRows, rowsFromSheet } from './data/tableUtils'
import { buildBaselinePublicationTable, buildCustomPublicationTable, publicationTableToRows, type CustomPublicationSource, type PublicationTable } from './export/publicationTables'
import type { ColumnType, Row, TypeOverrides } from './data/types'
import { getModelPlugin, modelPlugins } from './models/registry'
import type { InferenceConfig, ModelConfig, ModelParamValue, ModelPlugin, ModelResult, SpatialWeightsParam } from './models/types'
import { formatMetricValue, columnLabels, formatResultValue } from './components/results/resultFormat'
import {
  allModelCategory,
  dataPreviewOverscanRows,
  dataPreviewRowHeight,
  dataPreviewVisibleRows,
  layoutStorageKey,
  modelUsageStorageKey,
  snapshotStorageKey,
} from './constants/workbench'
import './App.css'

const stableMaturity: NonNullable<ModelPlugin['maturity']> = {
  level: 'stable',
  label: '正式',
  description: '浏览器内结果可用于常规探索分析。',
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

type CustomPublicationConfig = {
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

type CustomPublicationPresetId = 'baseline' | 'heterogeneity' | 'robustness' | 'endogeneity'

type CustomPublicationDragItem = {
  kind: 'column' | 'variable' | 'statistic'
  id: string
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
  )}，*** p<${formatPublicationThreshold(formatRules.starLevels.three)}`

const customPublicationPresetMeta: Array<{ id: CustomPublicationPresetId; label: string; detail: string }> = [
  { id: 'baseline', label: '基准回归', detail: '保留 Controls、固定效应、N 与 Adj-R²，适合主回归结果。' },
  { id: 'heterogeneity', label: '异质性', detail: '强调分组列头，适合不同样本或机制分组并排展示。' },
  { id: 'robustness', label: '稳健性', detail: '适合多设定对照，突出变量一致性与统计稳定性。' },
  { id: 'endogeneity', label: '内生性', detail: '适合工具变量、替代解释和识别策略的并列汇报。' },
]

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

const isDefaultCustomPublicationConfig = (config: CustomPublicationConfig) => JSON.stringify(config) === JSON.stringify(defaultCustomPublicationConfig())

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
  const [customPublicationConfig, setCustomPublicationConfig] = useState<CustomPublicationConfig>(loadCustomPublicationDraft)
  const [customPublicationTemplates, setCustomPublicationTemplates] = useState<CustomPublicationTemplate[]>(loadCustomPublicationTemplates)
  const [customPublicationDefaultTemplateId, setCustomPublicationDefaultTemplateId] = useState(loadCustomPublicationDefaultTemplateId)
  const [draggingPublicationItem, setDraggingPublicationItem] = useState<CustomPublicationDragItem | null>(null)
  const [workspaceModeOverride, setWorkspaceModeOverride] = useState<null | 'publication'>(null)
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
  const customPublicationPreviewTable = hasPublicationSources ? buildCustomPublicationTableFromConfig() : null
  const customPublicationPreviewHtml = customPublicationPreviewTable ? buildPublicationTableHtml(customPublicationPreviewTable) : ''
  const matchedCustomPublicationTemplate = useMemo(() => {
    const currentSignature = JSON.stringify(customPublicationConfig)
    return customPublicationTemplates.find((template) => JSON.stringify(template.config) === currentSignature) ?? null
  }, [customPublicationConfig, customPublicationTemplates])
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
  const recommendedModels = useMemo(() => {
    if (!hasDataset) return []
    const hasPanel = dataRoles.idFields.length > 0 && Boolean(dataRoles.timeField)
    const hasCategorical = profiles.some((p) => p.type === 'category')
    const numericCount = profiles.filter((p) => p.type === 'numeric').length
    const hasText = profiles.some((p) => p.type === 'text')
    const recs: Array<{ id: string; reason: string }> = []

    if (numericCount >= 2) recs.push({ id: 'linear-regression', reason: '数据含多个数值变量' })
    if (numericCount >= 3) recs.push({ id: 'correlation-analysis', reason: '探索变量间线性关系' })
    if (hasCategorical && numericCount >= 1) recs.push({ id: 'category-summary', reason: '按类别比较数值' })
    if (hasCategorical) recs.push({ id: 'crosstab-chi-square', reason: '含分类变量可做关联检验' })
    if (hasPanel) recs.push({ id: 'xtreg-fixed-effects', reason: '检测到面板结构' })
    if (hasText) recs.push({ id: 'bertopic', reason: '含文本字段' })
    if (numericCount >= 1) recs.push({ id: 'descriptive-statistics', reason: '快速概览数据分布' })

    return recs
      .filter((rec) => rec.id !== activeModel.id && modelPlugins.some((p) => p.id === rec.id))
      .slice(0, 3)
  }, [activeModel.id, dataRoles, hasDataset, profiles])
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
    if (rSquared !== null) {
      const quality = rSquared >= 0.7 ? '较强' : rSquared >= 0.4 ? '中等' : rSquared >= 0.15 ? '较弱' : '很弱'
      insights.push(`模型解释力${quality}（R² = ${formatNumber(rSquared, 3)}），自变量整体能解释因变量约 ${formatNumber(rSquared * 100, 1)}% 的变异。`)
    }
    const pValue = extractMetricNumber(result, 'p-value') ?? extractMetricNumber(result, 'Prob > F') ?? extractMetricNumber(result, 'Sobel p')
    if (pValue !== null) {
      const sigLevel = pValue < 0.001 ? '在 0.1% 水平高度显著' : pValue < 0.01 ? '在 1% 水平显著' : pValue < 0.05 ? '在 5% 水平显著' : pValue < 0.1 ? '在 10% 水平边际显著' : '未达到常用显著性阈值'
      insights.push(`整体模型检验 ${sigLevel}（p = ${formatResultValue(pValue, 'pValue')}）。`)
    }
    const nObs = extractMetricNumber(result, 'N') ?? extractMetricNumber(result, 'Observations')
    if (nObs !== null) {
      insights.push(`共纳入 ${formatNumber(nObs, 0)} 个有效观测进入估计。`)
    }
    if (mainTable && mainTable.id === 'coefficients') {
      const sigRows = mainTable.rows.filter((row) => {
        const p = typeof row.pValue === 'number' ? row.pValue : 1
        return p < 0.05
      })
      if (sigRows.length > 0) {
        const names = sigRows.slice(0, 3).map((row) => `${row.term ?? row.variable ?? ''}`).filter(Boolean)
        insights.push(`${sigRows.length} 个变量在 5% 水平显著${names.length > 0 ? `，包括 ${names.join('、')}` : ''}。`)
      } else if (mainTable.rows.length > 0) {
        insights.push('当前模型中没有变量在 5% 水平显著，建议检查变量选择或模型设定。')
      }
    }

    return insights.slice(0, 4)
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
  const workspaceMode = useMemo<'data' | 'model' | 'result' | 'report' | 'publication'>(() => {
    if (!hasDataset) return 'data'
    if (workspaceModeOverride === 'publication' && result && !isModelRunning) return 'publication'
    if (isExportModalOpen) return 'report'
    if (result && !hasStaleResult && !isModelRunning) return 'result'
    return 'model'
  }, [hasDataset, hasStaleResult, isExportModalOpen, isModelRunning, result, workspaceModeOverride])
  const leadInsight = resultInsights[0] ?? ''
  const secondaryInsights = resultInsights.slice(1)
  const visibleSummaryMetrics = result?.summary.slice(0, 4) ?? []
  const roleSummary = [
    dataRoles.idFields.length > 0 ? `ID ${summarizeFields(dataRoles.idFields)}` : '',
    dataRoles.timeField ? `Time ${dataRoles.timeField}` : '',
    dataRoles.groupFields.length > 0 ? `Group ${summarizeFields(dataRoles.groupFields)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const activeFormula = activeModel.getFormula(sanitizedConfig)
  const selectedFeatureSummary =
    selectedFeatures.length === 0
      ? '尚未选择解释变量'
      : selectedFeatures.length <= 3
        ? selectedFeatures.join('、')
        : `${selectedFeatures.slice(0, 3).join('、')} 等 ${selectedFeatures.length} 个变量`
  const fieldReadinessSummary = activeModel.requiresTarget
    ? `${activeModel.targetLabel}：${selectedTarget || '未设置'}`
    : `${activeModel.featuresLabel}：${selectedFeatureSummary}`
  const modelContextLead =
    validationErrors.length > 0
      ? validationErrors[0].message
      : activeModel.requiresTarget
        ? `${activeModel.targetLabel}已选为 ${selectedTarget || '未设置'}，${activeModel.featuresLabel}当前为 ${selectedFeatureSummary}。`
        : `${activeModel.featuresLabel}当前为 ${selectedFeatureSummary}。`
  const workspaceHeading =
    workspaceMode === 'data'
      ? '导入并整理数据'
      : workspaceMode === 'model'
        ? '配置并运行模型'
        : workspaceMode === 'publication'
          ? '编辑论文表'
        : workspaceMode === 'report'
          ? '整理并导出结果'
          : '阅读并解释结果'
  const workspaceLead =
    workspaceMode === 'data'
      ? '先导入数据，再设置维度字段和变量角色。'
      : workspaceMode === 'model'
        ? '当前工作区聚焦模型设定，先确认变量和基础参数。'
        : workspaceMode === 'publication'
          ? '把来源列、变量行、统计行和注释整理成一张适合导出的论文表。'
        : workspaceMode === 'report'
          ? '选择导出内容和格式，整理本次建模输出。'
          : '先读自然语言结论，再向下查看统计表和补充诊断。'
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

  function buildCustomPublicationTableFromConfig() {
    const sources: CustomPublicationSource[] = selectedPublicationSources.map((source, index) => {
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

  const updateCustomPublicationConfig = (patch: Partial<Pick<CustomPublicationConfig, 'title' | 'note'>>) => {
    setCustomPublicationConfig((current) => ({ ...current, ...patch }))
  }

  const updateCustomPublicationFormatRules = (patch: Partial<CustomPublicationFormatRules>) => {
    setCustomPublicationConfig((current) => {
      const nextFormatRules = {
        ...current.formatRules,
        ...patch,
        starLevels: patch.starLevels ? patch.starLevels : current.formatRules.starLevels,
      }
      const currentAutoNote = buildCustomPublicationNote(current.formatRules)
      return {
        ...current,
        formatRules: nextFormatRules,
        note: current.note.trim() === '' || current.note === currentAutoNote ? buildCustomPublicationNote(nextFormatRules) : current.note,
      }
    })
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

  const moveCustomPublicationColumn = (sourceId: string, direction: 'up' | 'down') => {
    setCustomPublicationConfig((current) => {
      const availableIds = selectedPublicationSources.map((source) => source.id)
      const orderedIds = [
        ...current.columnOrder.filter((id) => availableIds.includes(id)),
        ...availableIds.filter((id) => !current.columnOrder.includes(id)),
      ]
      const index = orderedIds.indexOf(sourceId)
      if (index === -1) return current
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= orderedIds.length) return current
      return { ...current, columnOrder: moveOrderedItem(orderedIds, sourceId, nextIndex) }
    })
  }

  const updateCustomPublicationVariableLabel = (variableId: string, label: string) => {
    setCustomPublicationConfig((current) => ({
      ...current,
      variableLabels: {
        ...current.variableLabels,
        [variableId]: label,
      },
    }))
  }

  const toggleCustomPublicationVariable = (variableId: string) => {
    setCustomPublicationConfig((current) => {
      const hidden = current.hiddenVariableIds.includes(variableId)
        ? current.hiddenVariableIds.filter((id) => id !== variableId)
        : [...current.hiddenVariableIds, variableId]
      return { ...current, hiddenVariableIds: hidden }
    })
  }

  const moveCustomPublicationVariable = (variableId: string, direction: 'up' | 'down') => {
    setCustomPublicationConfig((current) => {
      const availableIds = customPublicationVariableOptions.map((option) => option.id)
      const orderedIds = [
        ...current.variableOrder.filter((id) => availableIds.includes(id)),
        ...availableIds.filter((id) => !current.variableOrder.includes(id)),
      ]
      const index = orderedIds.indexOf(variableId)
      if (index === -1) return current
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= orderedIds.length) return current
      return { ...current, variableOrder: moveOrderedItem(orderedIds, variableId, nextIndex) }
    })
  }

  const moveCustomPublicationStatistic = (statisticId: string, direction: 'up' | 'down') => {
    setCustomPublicationConfig((current) => {
      const availableIds = customPublicationStatisticOptions.map((option) => option.id)
      const orderedIds = [
        ...current.statisticOrder.filter((id) => availableIds.includes(id)),
        ...availableIds.filter((id) => !current.statisticOrder.includes(id)),
      ]
      const index = orderedIds.indexOf(statisticId)
      if (index === -1) return current
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= orderedIds.length) return current
      return { ...current, statisticOrder: moveOrderedItem(orderedIds, statisticId, nextIndex) }
    })
  }

  const updateCustomPublicationStatisticLabel = (statisticId: string, label: string) => {
    setCustomPublicationConfig((current) => ({
      ...current,
      statisticLabels: {
        ...current.statisticLabels,
        [statisticId]: label,
      },
    }))
  }

  const toggleCustomPublicationStatistic = (statisticId: string) => {
    setCustomPublicationConfig((current) => {
      const disabled = current.disabledStatisticIds.includes(statisticId)
        ? current.disabledStatisticIds.filter((id) => id !== statisticId)
        : [...current.disabledStatisticIds, statisticId]
      return { ...current, disabledStatisticIds: disabled }
    })
  }

  const resetCustomPublicationOrdering = () => {
    setCustomPublicationConfig((current) => ({
      ...current,
      columnOrder: [],
      variableOrder: [],
      statisticOrder: [],
    }))
  }

  const setAllCustomPublicationVariables = (visible: boolean) => {
    setCustomPublicationConfig((current) => ({
      ...current,
      hiddenVariableIds: visible ? [] : orderedCustomPublicationVariableOptions.map((option) => option.id),
    }))
  }

  const setAllCustomPublicationStatistics = (enabled: boolean) => {
    setCustomPublicationConfig((current) => ({
      ...current,
      disabledStatisticIds: enabled ? [] : customPublicationStatisticOptions.map((option) => option.id),
    }))
  }

  const applyCustomPublicationPreset = (preset: CustomPublicationPresetId) => {
    setCustomPublicationConfig((current) => {
      const next = structuredClone(current)
      next.note = buildCustomPublicationNote(next.formatRules)
      if (preset === 'baseline') {
        next.title = '表 1：基准回归结果'
        next.disabledStatisticIds = []
        next.statisticOrder = Array.from(
          new Set(['controls', ...customPublicationStatisticOptions.filter((option) => option.id.startsWith('fe:')).map((option) => option.id), 'n', 'adj-r2']),
        )
        next.formatRules.booleanDisplay = 'yes-no'
        next.formatRules.parenthesisMode = 't'
      } else if (preset === 'heterogeneity') {
        next.title = '表：异质性分析'
        next.disabledStatisticIds = next.disabledStatisticIds.filter((id) => id !== 'controls')
        next.formatRules.booleanDisplay = 'yes-blank'
      } else if (preset === 'robustness') {
        next.title = '表：稳健性检验结果'
        next.disabledStatisticIds = next.disabledStatisticIds.filter((id) => id !== 'controls')
        next.formatRules.coefficientDigits = 4
        next.formatRules.statisticDigits = 2
      } else if (preset === 'endogeneity') {
        next.title = '表：内生性检验'
        next.disabledStatisticIds = next.disabledStatisticIds.filter((id) => id !== 'controls')
        next.formatRules.parenthesisMode = 't'
      }
      next.note = buildCustomPublicationNote(next.formatRules)
      return next
    })
  }

  const saveCustomPublicationTemplate = () => {
    const name = customPublicationConfig.title.trim() || `自定义论文表模板 ${customPublicationTemplates.length + 1}`
    const template: CustomPublicationTemplate = {
      id: crypto.randomUUID(),
      name,
      updatedAt: new Date().toISOString(),
      config: structuredClone(customPublicationConfig),
    }
    setCustomPublicationTemplates((current) => [template, ...current.filter((entry) => entry.name !== name)])
  }

  const restoreCustomPublicationDefaults = () => {
    setCustomPublicationConfig((current) => ({
      ...defaultCustomPublicationConfig(),
      selectedSourceIds: current.selectedSourceIds,
      columns: current.columns,
      columnOrder: current.columnOrder,
    }))
  }

  const ensureCustomPublicationDraftReady = () => {
    if (customPublicationDefaultTemplateId && isDefaultCustomPublicationConfig(customPublicationConfig)) {
      applyCustomPublicationTemplate(customPublicationDefaultTemplateId)
    }
  }

  const openPublicationWorkbench = () => {
    if (!result) return
    ensureCustomPublicationDraftReady()
    setIsExportModalOpen(false)
    setWorkspaceModeOverride('publication')
  }

  const closePublicationWorkbench = () => {
    setWorkspaceModeOverride(null)
  }

  const applyCustomPublicationTemplate = (templateId: string) => {
    const template = customPublicationTemplates.find((entry) => entry.id === templateId)
    if (!template) return
    setCustomPublicationConfig(normalizeCustomPublicationConfig(structuredClone(template.config)))
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
        const availableIds = selectedPublicationSources.map((source) => source.id)
        const orderedIds = [
          ...current.columnOrder.filter((id) => availableIds.includes(id)),
          ...availableIds.filter((id) => !current.columnOrder.includes(id)),
        ]
        return { ...current, columnOrder: moveOrderedItem(orderedIds, draggingPublicationItem.id, orderedIds.indexOf(targetId)) }
      })
    }
    if (kind === 'variable') {
      setCustomPublicationConfig((current) => {
        const availableIds = orderedCustomPublicationVariableOptions.map((option) => option.id)
        const orderedIds = [
          ...current.variableOrder.filter((id) => availableIds.includes(id)),
          ...availableIds.filter((id) => !current.variableOrder.includes(id)),
        ]
        return { ...current, variableOrder: moveOrderedItem(orderedIds, draggingPublicationItem.id, orderedIds.indexOf(targetId)) }
      })
    }
    if (kind === 'statistic') {
      setCustomPublicationConfig((current) => {
        const availableIds = customPublicationStatisticOptions.map((option) => option.id)
        const orderedIds = [
          ...current.statisticOrder.filter((id) => availableIds.includes(id)),
          ...availableIds.filter((id) => !current.statisticOrder.includes(id)),
        ]
        return { ...current, statisticOrder: moveOrderedItem(orderedIds, draggingPublicationItem.id, orderedIds.indexOf(targetId)) }
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

  function buildPublicationTableHtml(table: PublicationTable) {
    const mergeMap = new Map(table.merges.map((merge) => [`${merge.rowIndex}:${merge.columnIndex}`, merge.columnSpan]))
    const hiddenCells = new Set<string>()
    table.merges.forEach((merge) => {
      for (let offset = 1; offset < merge.columnSpan; offset += 1) hiddenCells.add(`${merge.rowIndex}:${merge.columnIndex + offset}`)
    })
    const rows = table.rows
      .map((row, rowIndex) => {
        const values = [row.label, ...row.values]
        const cells = values
          .map((cell, cellIndex) => {
            if (hiddenCells.has(`${rowIndex}:${cellIndex}`)) return ''
            const tag = row.role === 'title' || row.role === 'model' || row.role === 'header' ? 'th' : 'td'
            const classNames = [
              cellIndex === 0 ? 'row-label' : '',
              `row-role-${row.role}`,
              row.role === 'statistic' && cellIndex === 0 ? 'is-empty-label' : '',
              cellIndex > 0 && row.role !== 'coefficient' && row.role !== 'statistic' ? 'is-centered' : '',
            ]
              .filter(Boolean)
              .join(' ')
            const span = mergeMap.get(`${rowIndex}:${cellIndex}`)
            return `<${tag}${classNames ? ` class="${classNames}"` : ''}${span ? ` colspan="${span}"` : ''}>${escapeXml(cell)}</${tag}>`
          })
          .join('')
        return `<tr class="row-role-${row.role}">${cells}</tr>`
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
body{font-family:"Times New Roman","Noto Serif SC",serif;color:#1a1f26;margin:28px;line-height:1.65}h1{font-size:22px}h2{font-size:16px;margin:22px 0 8px}table{border-collapse:collapse;width:100%;margin:8px 0 14px}th,td{border:1px solid #d9ddd6;padding:6px 8px;font-size:12px;text-align:left}th{background:#f4f6f2}.publication-block{margin:20px 0 28px}.publication-table{margin:0}.three-line th,.three-line td{border-left:0;border-right:0;text-align:center;padding:4px 8px}.three-line .row-label{text-align:left}.three-line .is-empty-label{color:transparent}.three-line tr.row-role-title th{border-top:2px solid #1a1f26;border-bottom:0;font-size:16px;font-weight:700;background:#fff;padding:0 0 6px}.three-line tr.row-role-model th{border-top:0;border-bottom:0;background:#fff;font-weight:400;padding-top:1px;padding-bottom:1px}.three-line tr.row-role-header th{border-top:0;border-bottom:1px solid #1a1f26;background:#fff;font-weight:400}.three-line tr.row-role-coefficient td:first-child{font-weight:600}.three-line tr.row-role-statistic td{padding-top:0;color:#4b5563;font-size:11px}.three-line tr.row-role-metric td,.three-line tr.row-role-fixedEffect td{background:#fafaf7}.three-line tr:last-child td{border-bottom:2px solid #1a1f26}.three-line .is-centered{text-align:center}.note{margin-top:8px;padding-top:6px;border-top:1px solid rgba(26,31,38,0.12);font-size:12px;color:#66706b}code{white-space:pre-wrap}
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
          const isStatistic = role === 'statistic'
          const isMetric = role === 'metric' || role === 'fixedEffect'
          const isNote = role === 'note'
          const isLastTableRow = rowIndex === table.rows.length - 1
          const isTitleRow = role === 'title'
          const isHeaderRow = role === 'header'
          const isModelRow = role === 'model'
          const isCoefficientLabel = role === 'coefficient' && columnIndex === 0
          return excelCell(cell, {
            fontFamily: 'Times New Roman',
            fontSize: isTitleRow ? 12 : isNote ? 10 : 11,
            fontWeight: isHeader || isCoefficientLabel ? 'bold' : undefined,
            align: isTitleRow || isModelRow || columnIndex > 0 ? 'center' : 'left',
            wrap: true,
            columnSpan: mergeStarts.get(`${rowIndex}:${columnIndex}`),
            backgroundColor: isHeader ? '#ffffff' : isMetric ? '#fafaf7' : undefined,
            topBorderStyle: isTitleRow ? 'medium' : isHeaderRow ? 'thin' : undefined,
            bottomBorderStyle: isLastTableRow ? 'medium' : isHeaderRow ? 'thin' : isNote ? undefined : 'thin',
            leftBorderStyle: undefined,
            rightBorderStyle: undefined,
            textColor: isStatistic || isNote ? '#66706b' : '#1a1f26',
            fontStyle: isNote ? 'italic' : undefined,
            alignVertical: 'center',
            height: isTitleRow ? 24 : isModelRow ? 16 : isNote ? 18 : isStatistic ? 15 : 18,
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
    setSelectedExportItemIds((current) => {
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
      if (id === 'custom-publication' && !current.includes(id) && customPublicationDefaultTemplateId && isDefaultCustomPublicationConfig(customPublicationConfig)) {
        applyCustomPublicationTemplate(customPublicationDefaultTemplateId)
      }
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

  const visiblePublicationVariableCount = orderedCustomPublicationVariableOptions.filter((option) => !hiddenCustomPublicationVariableSet.has(option.id)).length
  const enabledPublicationStatisticCount = customPublicationStatisticOptions.filter((option) => !disabledCustomPublicationStatisticSet.has(option.id)).length
  const publicationTemplateStatus = matchedCustomPublicationTemplate
    ? `当前使用模板：${matchedCustomPublicationTemplate.name}`
    : customPublicationDefaultTemplateId
      ? '当前为草稿状态，可随时应用默认模板'
      : '当前为未命名草稿'

  const renderCustomPublicationWorkbench = () => (
    <section className="publication-workbench">
      <div className="publication-workbench__editor">
        <section className="publication-workbench__hero">
          <div>
            <span className="panel__label">Paper Table Workspace</span>
            <h2>{customPublicationConfig.title}</h2>
            <p>把来源列、变量行、统计行和注释整理成一张适合 Excel、Word 和 HTML 导出的论文表。</p>
          </div>
          <div className="publication-workbench__hero-actions">
            <button className="secondary-button is-subtle" type="button" onClick={closePublicationWorkbench}>
              返回结果区
            </button>
            <button className="secondary-button" type="button" onClick={openExportDialog} disabled={!result}>
              <Download size={14} />
              打开导出
            </button>
          </div>
        </section>

        <div className="publication-workbench__meta">
          <span>{selectedPublicationSources.length} 个来源列</span>
          <span>{visiblePublicationVariableCount} 个显示变量</span>
          <span>{enabledPublicationStatisticCount} 个统计行</span>
          <span>{publicationTemplateStatus}</span>
        </div>

        <div className="custom-publication-panel custom-publication-panel--workspace">
          <div className="custom-publication-toolbar">
            <div className="custom-publication-toolbar__group">
              {customPublicationPresetMeta.map((preset) => (
                <button className="secondary-button" type="button" key={preset.id} onClick={() => applyCustomPublicationPreset(preset.id)} disabled={isExporting} title={preset.detail}>
                  {preset.label}
                </button>
              ))}
            </div>
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
                      modelLabel: source.modelName,
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

          <div className="custom-publication-preview-grid">
            <section className="custom-publication-editor">
              <div className="custom-publication-editor__header">
                <strong>内置预设</strong>
                <span>先套一个常见论文结构，再按变量、统计行和列头精调，会更省力。</span>
              </div>
              <div className="custom-publication-preset-list">
                {customPublicationPresetMeta.map((preset) => (
                  <div className="custom-publication-preset" key={preset.id}>
                    <div><strong>{preset.label}</strong><small>{preset.detail}</small></div>
                    <button className="secondary-button" type="button" onClick={() => applyCustomPublicationPreset(preset.id)} disabled={isExporting}>套用</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="custom-publication-editor">
              <div className="custom-publication-editor__header">
                <strong>模板</strong>
                <span>保存、套用、复制、删除，并设置默认模板。</span>
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
              <p>右侧预览会实时反映列顺序、变量显示、统计行与注释内容。</p>
            </div>
            <button className="secondary-button is-subtle" type="button" onClick={openExportDialog} disabled={!result}>
              导出
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
        <div><span>当前表名</span><strong>{customPublicationConfig.title}</strong></div>
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
        <div className="topbar__brand">
          <span className="eyebrow">Visual Stats Lab</span>
          <h1>统计建模工作台</h1>
        </div>
        <div className="topbar__actions">
          <label className="icon-button" title="导入 CSV / XLSX">
            <Upload size={16} />
            <input
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
          <button className="primary-button" type="button" onClick={handleRunModel} disabled={!hasDataset || isModelRunning || validationErrors.length > 0}>
            <Play size={15} />
            {isModelRunning ? '运行中' : '运行模型'}
          </button>
        </div>
      </header>

      <section className={`workspace workspace--${workspaceMode} ${isHistoryCollapsed ? 'is-history-collapsed' : ''}`}>
        <aside className={`panel data-panel ${isHistoryCollapsed ? 'is-collapsed' : ''}`}>
          <div className="panel__header">
            <div>
              <span className="panel__label">Project</span>
              <h2>项目索引</h2>
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
            <div className="dataset-card dataset-card--compact">
              <span className="dataset-card__label">当前项目</span>
              <strong>{fileName || '尚未导入数据'}</strong>
              <p>{hasDataset ? `${rows.length} 行 · ${profiles.length} 字段` : '导入 CSV 或 XLSX 后开始分析。'}</p>
              {roleSummary ? <small className="dataset-card__meta">{roleSummary}</small> : null}
              <div className="dataset-card__actions">
                <button className="secondary-button" type="button" onClick={() => setIsDataModalOpen(true)} disabled={!hasDataset}>
                  <Table size={14} />
                  查看数据
                </button>
                <button className="secondary-button is-subtle" type="button" onClick={saveSnapshot} disabled={!hasDataset}>
                  <Save size={14} />
                  保存当前数据
                </button>
              </div>
            </div>

            {snapshots.length > 0 ? (
              <div className="snapshot-toolbar snapshot-toolbar--compact">
                <button
                  className="secondary-button is-subtle is-full"
                  type="button"
                  onClick={() => {
                    setIsSnapshotManageMode((current) => !current)
                    setSelectedSnapshotIds([])
                  }}
                >
                  {isSnapshotManageMode ? <Check size={14} /> : <SlidersHorizontal size={14} />}
                  {isSnapshotManageMode ? '完成管理' : '管理历史'}
                </button>
              </div>
            ) : null}

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

          <div className="snapshot-list snapshot-list--compact">
            {snapshots.length === 0 ? (
              <div className="empty-history">
                <History size={17} />
                保存一次当前数据后，这里会形成可回溯的项目索引。
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
                      {snapshot.result ? '含结果' : '仅配置'} · {new Date(snapshot.createdAt).toLocaleDateString()}
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
                <Database size={24} />
              </div>
              <h2>开始分析</h2>
              <p>导入 CSV 或 XLSX 文件，系统将自动识别字段类型并进入数据维度设置向导。</p>
              <label className="primary-button import-cta">
                <Upload size={15} />
                选择文件
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
                  <button className="primary-button" type="button" onClick={handleRunModel} disabled={!hasDataset || isModelRunning || validationErrors.length > 0}>
                    <Play size={14} />
                    {validationErrors.length > 0 ? '需调整后运行' : isModelRunning ? '运行中' : hasStaleResult ? '重新运行' : '运行模型'}
                  </button>
                </div>
              </section>

              <section className="workbench-meta-strip" aria-label="当前工作区状态">
                <span>{activeModel.name}</span>
                <span>{rows.length} 个观测</span>
                <span>{profiles.length} 个字段</span>
                <span>{panelDiagnosis.title}</span>
                <span>{modelMaturity.label}</span>
              </section>

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

              {workspaceMode === 'publication' && result ? (
                renderCustomPublicationWorkbench()
              ) : (
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

                  <section className="result-reading-section">
                    {isModelRunning ? (
                      <div className="notice is-running-task">
                        <Activity size={16} />
                        <div>
                          <strong>{runTask?.phase || '正在运行模型'}</strong>
                          {runTask ? (
                            <span>{runTask.progress}% · {formatDuration(runTask.elapsedMs)}</span>
                          ) : null}
                        </div>
                      </div>
                    ) : error ? (
                      <div className="notice is-error">
                        <AlertTriangle size={16} />
                        {error}
                      </div>
                    ) : result ? (
                      <>
                        <section className="result-primary-summary">
                          <div className="paper-section-heading">
                            <span className="paper-section-heading__index">一</span>
                            <div>
                              <strong>核心结论</strong>
                              <small>Natural-language findings</small>
                            </div>
                          </div>
                          <section className="lead-conclusion-card">
                            <div className="section-title">
                              <CheckCircle size={18} />
                              <h2>核心结论</h2>
                            </div>
                            <p className="lead-conclusion-card__lead">{leadInsight || '模型已完成运行，可以开始阅读结果。'}</p>
                            {secondaryInsights.length > 0 ? (
                              <div className="lead-conclusion-card__notes">
                                {secondaryInsights.map((insight) => (
                                  <p key={insight}>{insight}</p>
                                ))}
                              </div>
                            ) : null}
                          </section>

                          <blockquote className="paper-quote-note">
                            <p>"建议先阅读自然语言结论，再结合摘要指标和系数估计判断显著性、方向与经济含义。"</p>
                          </blockquote>

                          <div className="paper-section-heading">
                            <span className="paper-section-heading__index">二</span>
                            <div>
                              <strong>模型摘要</strong>
                              <small>Model summary</small>
                            </div>
                          </div>
                          <div className="summary-grid is-compact">
                            {visibleSummaryMetrics.map((metric) => (
                              <span key={metric.label}>
                                <strong>{formatMetricValue(metric)}</strong>
                                {metric.label}
                              </span>
                            ))}
                          </div>
                          <div className="result-insights result-insights--quiet">
                            <strong>阅读提示</strong>
                            <p>先确认模型摘要与显著性水平，再查看系数方向、区间和稳健性结果。</p>
                            <p>补充诊断与运行日志固定显示在结果阅读底部，用于核对模型质量和运行过程。</p>
                          </div>
                        </section>

                        <section className="result-tables">
                          {result ? <div className="result-tables__label">统计表格</div> : null}
                          {result ? (
                            <div className="paper-section-heading paper-section-heading--compact">
                              <span className="paper-section-heading__index">三</span>
                              <div>
                                <strong>系数估计</strong>
                                <small>Coefficient estimates</small>
                              </div>
                            </div>
                          ) : null}
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
                          {mainResultTable ? (
                            <blockquote className="paper-quote-note paper-quote-note--compact">
                              <p>"本表优先用于判断变量方向、显著性和区间范围；若用于正式写作，请同步报告模型摘要与估计设定。"</p>
                              <cite>表注说明</cite>
                            </blockquote>
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
                        </section>

                        <section className="result-support-section">
                          <div className="result-support-section__header">
                            <div>
                              <span className="panel__label">SUPPORT</span>
                              <h3>诊断与运行日志</h3>
                              <p>用于补充判断模型质量、运行过程和异常提示。</p>
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
                    ) : (
                      <div className="notice">
                        <Play size={16} />
                        {hasStaleResult ? '参数已变更，点击运行刷新。' : '设置参数后运行模型查看结果。'}
                      </div>
                    )}
                  </section>
                </div>
              </section>
              )}
            </>
          )}
        </section>

        <aside className="panel config-panel">
          <div className="panel__header">
            <div>
              <span className="panel__label">Context</span>
              <h2>上下文面板</h2>
            </div>
            <button className="ghost-button" type="button" onClick={() => setIsModelLibraryOpen(true)} title="模型库" disabled={isModelRunning}>
              <Search size={16} />
            </button>
          </div>

          <div className="context-mode-card">
            <span className="panel__label">当前模式</span>
            <strong>{workspaceHeading}</strong>
            <p>{nextAction}</p>
          </div>

          <div className="active-model-card">
            <div className="active-model-card__header">
              <span>{getModelCategory(activeModel)}</span>
              <button className="secondary-button is-subtle" type="button" onClick={() => setIsModelLibraryOpen(true)} disabled={isModelRunning}>
                切换模型
              </button>
            </div>
            <small className="model-description">{activeModel.description}</small>
            <div className={`model-quality is-${modelMaturity.level}`}>
              <strong>{modelMaturity.label}</strong>
              <span>{modelMaturity.description}</span>
            </div>
            <div className="model-identity">
              <span>{getModelCategory(activeModel)}</span>
              <code>{activeFormula}</code>
            </div>
          </div>

          {workspaceMode === 'data' ? (
            <section className="context-panel-card">
              <div className="parameter-section__header">
                <strong>数据上下文</strong>
                <span>当前先聚焦数据导入、维度字段和字段角色。</span>
              </div>
              <div className="context-mini-list">
                <div>
                  <span>数据文件</span>
                  <strong>{fileName || '尚未导入'}</strong>
                </div>
                <div>
                  <span>维度字段</span>
                  <strong>{roleSummary || '尚未设置 ID / Time / Group'}</strong>
                </div>
                <div>
                  <span>数据概况</span>
                  <strong>{rows.length} 行 · {profiles.length} 字段</strong>
                </div>
              </div>
            </section>
          ) : null}

          {workspaceMode === 'model' ? (
            <section className="context-panel-card">
              <div className="parameter-section__header">
                <strong>建模上下文</strong>
                <span>右侧只保留本次运行最相关的配置信息。</span>
              </div>
              <div className="context-mini-list">
                <div>
                  <span>当前模型</span>
                  <strong>{activeModel.name}</strong>
                </div>
                <div>
                  <span>字段设定</span>
                  <strong>{fieldReadinessSummary}</strong>
                </div>
                <div>
                  <span>解释变量</span>
                  <strong>{selectedFeatureSummary}</strong>
                </div>
              </div>
              <p className="context-panel-card__footnote">{modelContextLead}</p>
            </section>
          ) : null}

          {workspaceMode === 'result' && result ? (
            <section className="context-panel-card">
              <div className="parameter-section__header">
                <strong>结果辅助</strong>
                <span>用于解释、导出和回顾本次运行。</span>
              </div>
              <div className="summary-grid summary-grid--sidebar">
                {visibleSummaryMetrics.map((metric) => (
                  <span key={metric.label}>
                    <strong>{formatMetricValue(metric)}</strong>
                    {metric.label}
                  </span>
                ))}
              </div>
              <button className="secondary-button is-full" type="button" onClick={openPublicationWorkbench} disabled={!result}>
                进入论文表工作台
              </button>
              <button className="secondary-button is-subtle is-full" type="button" onClick={openExportDialog} disabled={!result}>
                <Download size={14} />
                选择导出内容
              </button>
            </section>
          ) : null}

          {workspaceMode === 'publication' && result ? (
            <section className="context-panel-card">
              <div className="parameter-section__header">
                <strong>论文表上下文</strong>
                <span>这里聚焦当前草稿、来源列和模板状态。</span>
              </div>
              <div className="context-mini-list">
                <div>
                  <span>表名</span>
                  <strong>{customPublicationConfig.title}</strong>
                </div>
                <div>
                  <span>来源列</span>
                  <strong>{selectedPublicationSources.length} 个</strong>
                </div>
                <div>
                  <span>模板状态</span>
                  <strong>{matchedCustomPublicationTemplate?.name ?? '草稿编辑中'}</strong>
                </div>
                <div>
                  <span>统计行</span>
                  <strong>{enabledPublicationStatisticCount} 个启用</strong>
                </div>
              </div>
              <p className="context-panel-card__footnote">{publicationTemplateStatus}</p>
              <button className="secondary-button is-full" type="button" onClick={closePublicationWorkbench}>
                返回结果区
              </button>
              <button className="secondary-button is-subtle is-full" type="button" onClick={openExportDialog} disabled={!result}>
                <Download size={14} />
                选择导出内容
              </button>
            </section>
          ) : null}

          {workspaceMode === 'report' && result ? (
            <section className="context-panel-card">
              <div className="parameter-section__header">
                <strong>报告上下文</strong>
                <span>导出阶段优先确认结论、核心表格和附加信息。</span>
              </div>
              <div className="context-mini-list">
                <div>
                  <span>核心结论</span>
                  <strong>{leadInsight || '结果已生成，可选择导出内容。'}</strong>
                </div>
                <div>
                  <span>模型摘要</span>
                  <strong>{visibleSummaryMetrics.map((metric) => `${metric.label} ${formatMetricValue(metric)}`).join(' · ')}</strong>
                </div>
              </div>
            </section>
          ) : null}

          {isModelRunning ? (
            <div className="parameter-lock-notice">
              <Activity size={14} />
              <span>模型运行中，参数已临时锁定。</span>
            </div>
          ) : null}

          {workspaceMode !== 'publication' && activeModel.parameterSchema ? (
            <div className="parameter-schema">
              {primaryParameterSections.map((section) => (
                <section className="parameter-section" key={section.id}>
                  <div className="parameter-section__header">
                    <strong>{section.title}</strong>
                    <span>{section.description}</span>
                  </div>
                  {section.fields.map(renderParameterField)}
                </section>
              ))}
            </div>
          ) : workspaceMode !== 'publication' && activeModel.requiresTarget ? (
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

          <details className="context-disclosure">
            <summary>高级参数与模型设定</summary>
            <div className="context-disclosure__body">
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
            </div>
          </details>

          <details className="context-disclosure">
            <summary>检查、推荐与运行环境</summary>
            <div className="context-disclosure__body">
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

              {recommendedModels.length > 0 ? (
                <div className="model-recommendations">
                  <strong>数据推荐</strong>
                  {recommendedModels.map((rec) => {
                    const plugin = modelPlugins.find((p) => p.id === rec.id)
                    return plugin ? (
                      <button
                        key={rec.id}
                        className="model-recommendation-chip"
                        type="button"
                        onClick={() => {
                          setActiveModelId(rec.id)
                          const featureColumns = getFeatureColumnsForPlugin(plugin, profiles.filter((p) => !dimensionColumns.has(p.name)), prepConfig.categoricalEncoding)
                          setModelConfig(plugin.getDefaultConfig(featureColumns, numericColumns))
                          setModelUsage((current) => ({
                            ...current,
                            [rec.id]: { usedCount: (current[rec.id]?.usedCount ?? 0) + 1, lastUsedAt: new Date().toISOString() },
                          }))
                        }}
                        disabled={isModelRunning}
                      >
                        <span>{plugin.name}</span>
                        <small>{rec.reason}</small>
                      </button>
                    ) : null
                  })}
                </div>
              ) : null}

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
            </div>
          </details>
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

            <div className="modal-summary-strip">
              <div>
                <span>当前模型</span>
                <strong>{activeModel.name}</strong>
              </div>
              <div>
                <span>当前分类</span>
                <strong>{selectedModelCategory}</strong>
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
