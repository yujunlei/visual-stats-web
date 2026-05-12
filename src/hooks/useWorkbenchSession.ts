import { useCallback, useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { readSheet } from 'read-excel-file/browser'
import { emptyDataRoles, inferDataRoles, withoutField, type DataRoles } from '../data/dataRoles'
import { summarizeMissingValues, type MissingValueAlert } from '../data/missingValues'
import { diagnosePanelBalance } from '../data/panelBalance'
import type { DataPrepConfig, RunLogEntry } from '../data/preprocess'
import { profileRows, rowsFromSheet } from '../data/tableUtils'
import type { ColumnType, Row, TypeOverrides } from '../data/types'
import { allModelCategory, modelUsageStorageKey } from '../constants/workbench'
import { createEmptyModelConfig, removeImplicitColumnDefaults, selectedParamValues, type ParameterField } from '../models/modelConfig'
import { filterAndSortModelPlugins, getRecentModelPlugins, recordModelUsage, type ModelUsageMap } from '../models/modelUsage'
import { getModelMaturity, getModelPlugin, getModelTaskGroup, modelPlugins, modelTaskGroupOrder } from '../models/registry'
import { parseSpatialWeightsText } from '../models/spatialWeightsParser'
import type { InferenceConfig, ModelConfig, ModelParamValue, ModelPlugin, SpatialWeightsParam } from '../models/types'
import { formatDuration, isSlowModel } from '../workers/runProgress'
import { createRunSignature, useModelRun, type RunState, type WorkflowStep } from './useModelRun'
import { useSnapshots, type WorkbenchSnapshot } from './useSnapshots'

export type PendingImport = {
  fileName: string
  rows: Row[]
  roles: DataRoles
}

export type ValidationIssue = {
  level: 'error' | 'warning'
  message: string
}

export type WorkspaceMode = 'data' | 'model' | 'result' | 'report' | 'publication'
export type WorkspaceTab = 'workbench' | 'publication'
export type FieldRoleValue = 'model' | 'id' | 'time' | 'group'

export type ImportPlan =
  | { kind: 'empty'; error: string }
  | { kind: 'missing-values'; alert: MissingValueAlert }
  | { kind: 'ready'; pendingImport: PendingImport }

type ParameterSectionId = 'fields' | 'estimation' | 'advanced'

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

export const noModelPlugin: ModelPlugin = {
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

export const defaultPrepConfig: DataPrepConfig = {
  missingStrategy: 'drop',
  categoricalEncoding: 'one-hot',
}

export const defaultInferenceConfig: InferenceConfig = {
  standardError: 'ols',
  clusterField: '',
}

const previewValue = (value: Row[string]) => {
  if (value === null || value === undefined || value === '') return 'NA'
  return String(value)
}

export const asParamString = (value: ModelParamValue | undefined) => {
  if (Array.isArray(value)) return value[0] ?? ''
  if (value && typeof value === 'object') return ''
  return value === undefined ? '' : String(value)
}

export const asParamArray = (value: ModelParamValue | undefined) =>
  Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []

export const asSpatialWeightsParam = (value: ModelParamValue | undefined): SpatialWeightsParam | null =>
  value && typeof value === 'object' && !Array.isArray(value) && value.kind === 'spatial-weights' ? value : null

export const cleanImportedRows = (rows: Row[]) => rows.filter((row) => Object.values(row).some((value) => value !== null && value !== ''))

export const createImportPlan = (rows: Row[], fileName: string): ImportPlan => {
  const cleanedRows = cleanImportedRows(rows)
  if (cleanedRows.length === 0) {
    return { kind: 'empty', error: '文件没有可读取的数据。' }
  }

  const missingSummary = summarizeMissingValues(cleanedRows, fileName)
  if (missingSummary) {
    return { kind: 'missing-values', alert: missingSummary }
  }

  return {
    kind: 'ready',
    pendingImport: {
      fileName,
      rows: cleanedRows,
      roles: inferDataRoles(cleanedRows),
    },
  }
}

export const applyFieldRole = (roles: DataRoles, field: string, role: string): DataRoles => {
  const baseRoles = {
    idFields: withoutField(roles.idFields, field),
    timeField: roles.timeField === field ? '' : roles.timeField,
    groupFields: withoutField(roles.groupFields, field),
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
}

export const toggleRoleField = (roles: DataRoles, kind: 'id' | 'group', field: string): DataRoles => {
  if (kind === 'id') {
    const nextIdFields = roles.idFields.includes(field) ? withoutField(roles.idFields, field) : [...roles.idFields, field]

    return {
      idFields: nextIdFields,
      timeField: roles.timeField === field ? '' : roles.timeField,
      groupFields: withoutField(roles.groupFields, field),
    }
  }

  const nextGroupFields = roles.groupFields.includes(field) ? withoutField(roles.groupFields, field) : [...roles.groupFields, field]

  return {
    idFields: withoutField(roles.idFields, field),
    timeField: roles.timeField === field ? '' : roles.timeField,
    groupFields: nextGroupFields,
  }
}

export const setRoleTimeField = (roles: DataRoles, field: string): DataRoles => ({
  idFields: withoutField(roles.idFields, field),
  timeField: field,
  groupFields: withoutField(roles.groupFields, field),
})

export const getFeatureColumnsForPlugin = (
  plugin: ModelPlugin,
  profiles: ReturnType<typeof profileRows>,
  categoricalEncoding: DataPrepConfig['categoricalEncoding'],
) => {
  if (plugin.supportedFeatureTypes) {
    return profiles.filter((profile) => plugin.supportedFeatureTypes?.includes(profile.type)).map((profile) => profile.name)
  }

  const numericColumns = profiles.filter((profile) => profile.type === 'numeric').map((profile) => profile.name)
  const categoricalColumns = profiles.filter((profile) => profile.type === 'category').map((profile) => profile.name)

  return plugin.supportsCategoricalFeatures && categoricalEncoding === 'one-hot'
    ? [...numericColumns, ...categoricalColumns]
    : numericColumns
}

export const getParameterSectionId = (field: ParameterField): ParameterSectionId => {
  if (field.kind === 'number') return 'estimation'
  if (field.kind === 'file') return 'advanced'
  if (advancedParameterIds.has(field.id)) return 'advanced'
  return 'fields'
}

export type ModelSwitchReset = {
  activeModelId: string
  draftModelId: string
  modelConfig: ModelConfig
  uploadError: string
  runState: RunState
  workflowStep: WorkflowStep
  isVariableSetupOpen: boolean
}

export const createModelSwitchReset = (nextModel: ModelPlugin, hasDataset: boolean): ModelSwitchReset => ({
  activeModelId: nextModel.id,
  draftModelId: nextModel.id,
  modelConfig: createEmptyModelConfig(nextModel),
  uploadError: '',
  runState: {
    result: null,
    error: '',
    logs: [{ level: 'info', message: `已切换到${nextModel.name}，请重新设置变量后运行。` }],
    signature: '',
  },
  workflowStep: hasDataset ? 'variables' : 'model',
  isVariableSetupOpen: false,
})

export type BuildValidationIssuesInput = {
  rows: Row[]
  hasDataset: boolean
  hasActiveModel: boolean
  activeModel: ModelPlugin
  sanitizedConfig: ModelConfig
  inferenceConfig: InferenceConfig
  effectiveInference: InferenceConfig
}

export const buildValidationIssues = ({
  rows,
  hasDataset,
  hasActiveModel,
  activeModel,
  sanitizedConfig,
  inferenceConfig,
  effectiveInference,
}: BuildValidationIssuesInput): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  const selectedTarget = sanitizedConfig.target
  const selectedFeatures = sanitizedConfig.features

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
      issues.push({ level: 'warning', message: '独立 t 检验当前会自动取样本量最大的两个组，其他组不会参与比较。' })
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

  if (isSlowModel(activeModel.id)) {
    issues.push({ level: 'warning', message: `${activeModel.name}属于较慢模型，建议先用小字段集确认设定后再完整运行。` })
  }

  if (rows.length > 5000 && isSlowModel(activeModel.id)) {
    issues.push({ level: 'warning', message: '当前数据量较大，运行可能需要更长时间。' })
  }

  return issues
}

export type EffectiveWorkflowInput = {
  isModelRunning: boolean
  hasActiveModel: boolean
  modelError: string
  result: unknown
  hasStaleResult: boolean
  hasDataset: boolean
  workflowStep: WorkflowStep
}

export const resolveEffectiveWorkflowStep = ({
  isModelRunning,
  hasActiveModel,
  modelError,
  result,
  hasStaleResult,
  hasDataset,
  workflowStep,
}: EffectiveWorkflowInput): WorkflowStep => {
  if (isModelRunning) return 'run'
  if (!hasActiveModel) return 'model'
  if (modelError) return 'variables'
  if (result && !hasStaleResult) return 'results'
  if (result && hasStaleResult && workflowStep === 'results') return 'variables'
  if (!hasDataset && workflowStep !== 'model') return 'upload'
  if (workflowStep === 'run') return 'variables'
  return workflowStep
}

export const resolveWorkspaceMode = (input: {
  workspaceTab: WorkspaceTab
  isExportModalOpen: boolean
  effectiveWorkflowStep: WorkflowStep
}): WorkspaceMode => {
  if (input.workspaceTab === 'publication') return 'publication'
  if (input.isExportModalOpen) return 'report'
  if (input.effectiveWorkflowStep === 'results') return 'result'
  if (input.effectiveWorkflowStep === 'upload' || input.effectiveWorkflowStep === 'roles') return 'data'
  return 'model'
}

const loadModelUsage = () => {
  try {
    if (typeof window === 'undefined') return {}
    const stored = window.localStorage.getItem(modelUsageStorageKey)
    return stored ? (JSON.parse(stored) as ModelUsageMap) : {}
  } catch {
    return {}
  }
}

export type UseWorkbenchSessionOptions = {
  workspaceTab?: WorkspaceTab
  isExportModalOpen?: boolean
  onSwitchModel?: () => void
}

export function useWorkbenchSession({
  workspaceTab = 'workbench',
  isExportModalOpen = false,
  onSwitchModel,
}: UseWorkbenchSessionOptions = {}) {
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [typeOverrides, setTypeOverrides] = useState<TypeOverrides>({})
  const [prepConfig, setPrepConfig] = useState<DataPrepConfig>(defaultPrepConfig)
  const [inferenceConfig, setInferenceConfig] = useState<InferenceConfig>(defaultInferenceConfig)
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const [draftModelId, setDraftModelId] = useState<string | null>(null)
  const [isDataModalOpen, setIsDataModalOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [missingValueAlert, setMissingValueAlert] = useState<MissingValueAlert | null>(null)
  const [dataRoles, setDataRoles] = useState<DataRoles>(emptyDataRoles)
  const [isModelLibraryOpen, setIsModelLibraryOpen] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [selectedModelCategory, setSelectedModelCategory] = useState(allModelCategory)
  const [modelUsage, setModelUsage] = useState<ModelUsageMap>(loadModelUsage)
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('model')
  const [isVariableSetupOpen, setIsVariableSetupOpen] = useState(false)

  const hasActiveModel = Boolean(activeModelId)
  const activeModel = activeModelId ? getModelPlugin(activeModelId) : noModelPlugin
  const draftModel = draftModelId ? getModelPlugin(draftModelId) : null
  const modelMaturity = getModelMaturity(activeModel)
  const hasDataset = rows.length > 0

  const profiles = useMemo(() => profileRows(rows, typeOverrides), [rows, typeOverrides])
  const previewColumns = useMemo(() => Object.keys(rows[0] ?? {}), [rows])
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
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => createEmptyModelConfig(null))

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(modelUsageStorageKey, JSON.stringify(modelUsage))
      }
    } catch {
      // Usage ranking is best-effort and should not block analysis.
    }
  }, [modelUsage])

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
    [activeModel.supportsInference, activeModelId, dataRoles, effectiveInference, fileName, hasActiveModel, prepConfig, profiles, rows.length, sanitizedConfig],
  )

  const {
    runState,
    runStatus,
    runTask,
    runFailureDialog,
    isModelRunning,
    cancelRunTask,
    closeRunFailureDialog,
    handleRunModel: runModel,
    replaceRunState,
  } = useModelRun({
    hasDataset,
    hasActiveModel,
    activeModel,
    rows,
    profiles,
    sanitizedConfig,
    prepConfig,
    effectiveInference,
    currentRunSignature,
    modelMaturity,
    setWorkflowStep,
    setIsVariableSetupOpen,
    setUploadError,
  })

  const {
    snapshotViewFilter,
    setSnapshotViewFilter,
    snapshots,
    renamingSnapshotId,
    snapshotNameDraft,
    setSnapshotNameDraft,
    selectedSnapshotIds,
    setSelectedSnapshotIds,
    isSnapshotManageMode,
    setIsSnapshotManageMode,
    selectedSnapshotIdSet,
    sortedSnapshots,
    filteredSnapshots,
    visibleSnapshots,
    visibleSnapshotIds,
    selectedSnapshots,
    selectedSnapshotsAllPinned,
    selectedSnapshotsAllFavorite,
    snapshotSummaryText,
    saveSnapshot: saveSnapshotDraft,
    restoreSnapshot,
    startRenameSnapshot,
    cancelRenameSnapshot,
    commitRenameSnapshot,
    toggleSnapshotFlag,
    toggleSnapshotSelection,
    toggleAllSnapshots,
    setSelectedSnapshotFlag,
    updateSnapshotNote,
    setSnapshotTags,
    toggleSnapshotTag,
    deleteSelectedSnapshots,
    deleteSnapshot,
  } = useSnapshots({
    onPersistError: setUploadError,
    onRestoreSnapshot: (snapshot: WorkbenchSnapshot) => {
      setRows(snapshot.rows)
      setFileName(snapshot.fileName)
      setDataRoles(snapshot.dataRoles ?? emptyDataRoles)
      setTypeOverrides(snapshot.typeOverrides)
      setPrepConfig(snapshot.prepConfig)
      setInferenceConfig(snapshot.inferenceConfig ?? defaultInferenceConfig)
      setActiveModelId(snapshot.modelId)
      setDraftModelId(snapshot.modelId)
      setModelConfig(snapshot.modelConfig)
      if (snapshot.result) {
        const snapshotProfiles = profileRows(snapshot.rows, snapshot.typeOverrides)
        const snapshotModel = getModelPlugin(snapshot.modelId)
        replaceRunState({
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
            inference: snapshotModel.supportsInference ? (snapshot.inferenceConfig ?? defaultInferenceConfig) : undefined,
            config: snapshot.modelConfig,
          }),
        })
      }
      setUploadError('')
    },
  })

  const hasStaleResult = Boolean(runState.result && runState.signature !== currentRunSignature)
  const result = hasStaleResult ? null : runState.result
  const modelError = runState.signature === currentRunSignature ? runState.error : ''
  const mainResultTable = useMemo(() => result?.tables.find((table) => table.id === 'coefficients') ?? result?.tables[0] ?? null, [result])
  const secondaryResultTables = useMemo(
    () => result?.tables.filter((table) => table.id !== mainResultTable?.id) ?? [],
    [mainResultTable?.id, result],
  )
  const runLogs = useMemo(() => {
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
  }, [currentRunSignature, hasDataset, hasStaleResult, isModelRunning, modelError, result, runState.logs, runState.signature, runStatus, runTask])

  const modelOrder = useMemo(() => new Map(modelPlugins.map((plugin, index) => [plugin.id, index])), [])
  const modelCategories = useMemo(
    () => [allModelCategory, ...modelTaskGroupOrder.filter((category) => modelPlugins.some((plugin) => getModelTaskGroup(plugin) === category))],
    [],
  )
  const filteredModelPlugins = useMemo(
    () =>
      filterAndSortModelPlugins({
        plugins: modelPlugins,
        query: modelSearch,
        selectedCategory: selectedModelCategory,
        allCategory: allModelCategory,
        activeModelId,
        modelUsage,
        modelOrder,
        getTaskGroup: getModelTaskGroup,
      }),
    [activeModelId, modelOrder, modelSearch, modelUsage, selectedModelCategory],
  )
  const recentModelPlugins = useMemo(
    () => getRecentModelPlugins(modelPlugins, modelUsage, activeModelId),
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

  const validationIssues = useMemo(
    () =>
      buildValidationIssues({
        rows,
        hasDataset,
        hasActiveModel,
        activeModel,
        sanitizedConfig,
        inferenceConfig,
        effectiveInference,
      }),
    [activeModel, effectiveInference, hasActiveModel, hasDataset, inferenceConfig, rows, sanitizedConfig],
  )
  const validationErrors = useMemo(() => validationIssues.filter((issue) => issue.level === 'error'), [validationIssues])
  const hasRoleSetting = dataRoles.idFields.length > 0 || Boolean(dataRoles.timeField) || dataRoles.groupFields.length > 0
  const effectiveWorkflowStep = useMemo(
    () =>
      resolveEffectiveWorkflowStep({
        isModelRunning,
        hasActiveModel,
        modelError,
        result,
        hasStaleResult,
        hasDataset,
        workflowStep,
      }),
    [hasActiveModel, hasDataset, hasStaleResult, isModelRunning, modelError, result, workflowStep],
  )
  const workspaceMode = useMemo(
    () => resolveWorkspaceMode({ workspaceTab, isExportModalOpen, effectiveWorkflowStep }),
    [effectiveWorkflowStep, isExportModalOpen, workspaceTab],
  )
  const canImportData = hasActiveModel && !isModelRunning
  const selectedFeatureSummary =
    selectedFeatures.length === 0
      ? '尚未选择解释变量'
      : selectedFeatures.length <= 3
        ? selectedFeatures.join('、')
        : `${selectedFeatures.slice(0, 3).join('、')} 等 ${selectedFeatures.length} 个变量`
  const activeFormula =
    !hasActiveModel
      ? '尚未选择模型'
      : !hasDataset || validationErrors.length > 0
        ? '尚未完成变量设定'
        : activeModel.getFormula(sanitizedConfig)

  const applyRows = useCallback(
    (nextRows: Row[], nextFileName: string, nextDataRoles = emptyDataRoles) => {
      const cleanedRows = cleanImportedRows(nextRows)
      if (cleanedRows.length === 0) {
        setUploadError('文件没有可读取的数据。')
        return
      }

      setRows(cleanedRows)
      setFileName(nextFileName)
      setDataRoles(nextDataRoles)
      setModelConfig(createEmptyModelConfig(activeModel))
      setTypeOverrides({})
      setUploadError('')
      replaceRunState({
        result: null,
        error: '',
        logs: [{ level: 'info', message: '数据已导入，请设置变量后运行模型。' }],
        signature: '',
      })
      setWorkflowStep('roles')
    },
    [activeModel, replaceRunState],
  )

  const startImportWizard = useCallback((cleanedRows: Row[], nextFileName: string) => {
    setPendingImport({
      fileName: nextFileName,
      rows: cleanedRows,
      roles: inferDataRoles(cleanedRows),
    })
    setUploadError('')
  }, [])

  const openImportWizard = useCallback(
    (nextRows: Row[], nextFileName: string) => {
      const plan = createImportPlan(nextRows, nextFileName)
      if (plan.kind === 'empty') {
        setUploadError(plan.error)
        return
      }

      if (plan.kind === 'missing-values') {
        setPendingImport(null)
        setMissingValueAlert(plan.alert)
        setUploadError('')
        return
      }

      startImportWizard(plan.pendingImport.rows, plan.pendingImport.fileName)
    },
    [startImportWizard],
  )

  const continueImportAfterMissingAlert = useCallback(() => {
    if (!missingValueAlert) return

    startImportWizard(missingValueAlert.rows, missingValueAlert.fileName)
    setMissingValueAlert(null)
  }, [missingValueAlert, startImportWizard])

  const cancelMissingValueImport = useCallback(() => {
    setMissingValueAlert(null)
    setUploadError('')
  }, [])

  const confirmImport = useCallback(() => {
    if (!pendingImport) return

    applyRows(pendingImport.rows, pendingImport.fileName, pendingImport.roles)
    setPendingImport(null)
  }, [applyRows, pendingImport])

  const updatePendingRoles = useCallback((updater: (roles: DataRoles) => DataRoles) => {
    setPendingImport((current) => (current ? { ...current, roles: updater(current.roles) } : current))
  }, [])

  const togglePendingRoleField = useCallback(
    (kind: 'id' | 'group', field: string) => {
      updatePendingRoles((current) => toggleRoleField(current, kind, field))
    },
    [updatePendingRoles],
  )

  const setPendingTimeField = useCallback(
    (field: string) => {
      updatePendingRoles((current) => setRoleTimeField(current, field))
    },
    [updatePendingRoles],
  )

  const setDataFieldRole = useCallback((field: string, role: string) => {
    setDataRoles((current) => applyFieldRole(current, field, role))
  }, [])

  const switchModel = useCallback(
    (modelId: string) => {
      if (isModelRunning) return
      const nextModel = getModelPlugin(modelId)
      const reset = createModelSwitchReset(nextModel, hasDataset)
      setActiveModelId(reset.activeModelId)
      setDraftModelId(reset.draftModelId)
      setModelConfig(reset.modelConfig)
      setUploadError(reset.uploadError)
      replaceRunState(reset.runState)
      setModelUsage((current) => recordModelUsage(current, nextModel.id))
      setModelSearch('')
      setIsModelLibraryOpen(false)
      setWorkflowStep(reset.workflowStep)
      setIsVariableSetupOpen(reset.isVariableSetupOpen)
      onSwitchModel?.()
    },
    [hasDataset, isModelRunning, onSwitchModel, replaceRunState],
  )

  const openModelLibrary = useCallback(() => {
    if (isModelRunning) return
    setDraftModelId(null)
    setIsModelLibraryOpen(true)
  }, [isModelRunning])

  const applyDraftModel = useCallback(() => {
    if (isModelRunning || !draftModel) return
    switchModel(draftModel.id)
  }, [draftModel, isModelRunning, switchModel])

  const handleRunModel = useCallback(() => runModel(validationErrors), [runModel, validationErrors])

  const openVariableSetup = useCallback(() => {
    if (!hasDataset || !hasActiveModel || isModelRunning) return
    setWorkflowStep('variables')
    setIsVariableSetupOpen(true)
  }, [hasActiveModel, hasDataset, isModelRunning])

  const saveVariableSetup = useCallback(() => {
    setWorkflowStep('variables')
    setIsVariableSetupOpen(false)
  }, [])

  const saveVariableSetupAndRun = useCallback(() => {
    if (validationErrors.length > 0) return
    setIsVariableSetupOpen(false)
    handleRunModel()
  }, [handleRunModel, validationErrors.length])

  const saveSnapshot = useCallback(() => {
    if (!hasDataset || !hasActiveModel) return

    saveSnapshotDraft({
      activeModel,
      fileName,
      rows,
      dataRoles,
      typeOverrides,
      prepConfig,
      inferenceConfig: effectiveInference,
      modelConfig: sanitizedConfig,
      result,
      resultLogs: runLogs,
      fieldCount: profiles.length,
    })
  }, [activeModel, dataRoles, effectiveInference, fileName, hasActiveModel, hasDataset, prepConfig, profiles.length, result, rows, runLogs, sanitizedConfig, saveSnapshotDraft, typeOverrides])

  const handleUpload = useCallback(
    async (file: File | undefined) => {
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
    },
    [hasActiveModel, openImportWizard],
  )

  const setTarget = useCallback((target: string) => {
    setModelConfig((current) => ({ ...current, target }))
  }, [])

  const toggleFeature = useCallback((name: string) => {
    setModelConfig((current) => ({
      ...current,
      features: current.features.includes(name)
        ? current.features.filter((feature) => feature !== name)
        : [...current.features, name],
    }))
  }, [])

  const setSchemaParamColumn = useCallback(
    (field: ParameterField, value: string) => {
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
    },
    [activeModel.parameterSchema],
  )

  const setParamNumber = useCallback((paramId: string, value: number) => {
    setModelConfig((current) => ({
      ...current,
      params: {
        ...current.params,
        [paramId]: value,
      },
    }))
  }, [])

  const setParamValue = useCallback((paramId: string, value: ModelParamValue) => {
    setModelConfig((current) => ({
      ...current,
      params: {
        ...current.params,
        [paramId]: value,
      },
    }))
  }, [])

  const importSpatialWeights = useCallback(
    async (paramId: string, file: File | undefined) => {
      if (!file) return

      try {
        const text = await file.text()
        const weights = parseSpatialWeightsText(text, file.name)
        setParamValue(paramId, weights)
        setUploadError('')
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : '空间权重文件解析失败。')
      }
    },
    [setParamValue],
  )

  const toggleParamColumn = useCallback((paramId: string, value: string, maxSelections?: number) => {
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
  }, [])

  const updateColumnType = useCallback((column: string, type: ColumnType) => {
    setTypeOverrides((current) => ({ ...current, [column]: type }))
  }, [])

  const updatePrepConfig = useCallback((patch: Partial<DataPrepConfig>) => {
    setPrepConfig((current) => ({ ...current, ...patch }))
  }, [])

  const updateInferenceConfig = useCallback((patch: Partial<InferenceConfig>) => {
    setInferenceConfig((current) => ({ ...current, ...patch }))
  }, [])

  const selectWorkflowStep = useCallback(
    (step: WorkflowStep) => {
      if (step !== 'model' && !hasActiveModel) return
      if (step === 'results' && !result) return
      if ((step === 'roles' || step === 'variables' || step === 'run') && !hasDataset) return
      if (step === 'run' && (!isModelRunning || validationErrors.length > 0)) return
      if (step === 'variables') {
        openVariableSetup()
        return
      }
      setWorkflowStep(step)
    },
    [hasActiveModel, hasDataset, isModelRunning, openVariableSetup, result, validationErrors.length],
  )

  return {
    data: {
      rows,
      fileName,
      uploadError,
      typeOverrides,
      prepConfig,
      dataRoles,
      pendingImport,
      missingValueAlert,
      isDataModalOpen,
      hasDataset,
      profiles,
      previewColumns,
      pendingColumns,
      pendingProfiles,
      pendingPreviewRows,
      dimensionColumns,
      modelProfiles,
      featureProfiles,
      numericColumns,
      panelDiagnosis,
      hasRoleSetting,
    },
    model: {
      activeModelId,
      draftModelId,
      activeModel,
      draftModel,
      hasActiveModel,
      modelConfig,
      inferenceConfig,
      effectiveInference,
      sanitizedConfig,
      selectedTarget,
      selectedFeatures,
      selectedFeatureSummary,
      schemaColumnsByType,
      selectableFeatureColumns,
      eligibleFeatureColumns,
      clusterColumns,
      isModelLibraryOpen,
      modelSearch,
      selectedModelCategory,
      modelUsage,
      modelMaturity,
      modelOrder,
      modelCategories,
      filteredModelPlugins,
      recentModelPlugins,
      parameterSections,
      validationIssues,
      validationErrors,
      activeFormula,
    },
    workflow: {
      workflowStep,
      isVariableSetupOpen,
      effectiveWorkflowStep,
      workspaceMode,
      canImportData,
      hasStaleResult,
    },
    run: {
      currentRunSignature,
      result,
      mainResultTable,
      secondaryResultTables,
      modelError,
      runLogs,
      runState,
      runStatus,
      runTask,
      runFailureDialog,
      isModelRunning,
    },
    snapshots: {
      snapshotViewFilter,
      snapshots,
      renamingSnapshotId,
      snapshotNameDraft,
      selectedSnapshotIds,
      isSnapshotManageMode,
      selectedSnapshotIdSet,
      sortedSnapshots,
      filteredSnapshots,
      visibleSnapshots,
      visibleSnapshotIds,
      selectedSnapshots,
      selectedSnapshotsAllPinned,
      selectedSnapshotsAllFavorite,
      snapshotSummaryText,
    },
    actions: {
      data: {
        setRows,
        setFileName,
        setUploadError,
        setTypeOverrides,
        setPrepConfig,
        updatePrepConfig,
        setDataRoles,
        setIsDataModalOpen,
        setPendingImport,
        setMissingValueAlert,
        applyRows,
        openImportWizard,
        continueImportAfterMissingAlert,
        cancelMissingValueImport,
        confirmImport,
        updatePendingRoles,
        togglePendingRoleField,
        setPendingTimeField,
        setDataFieldRole,
        handleUpload,
        updateColumnType,
      },
      model: {
        setActiveModelId,
        setDraftModelId,
        setModelConfig,
        setInferenceConfig,
        updateInferenceConfig,
        setIsModelLibraryOpen,
        setModelSearch,
        setSelectedModelCategory,
        setModelUsage,
        switchModel,
        openModelLibrary,
        applyDraftModel,
        setTarget,
        toggleFeature,
        setSchemaParamColumn,
        setParamNumber,
        setParamValue,
        importSpatialWeights,
        toggleParamColumn,
      },
      workflow: {
        setWorkflowStep,
        setIsVariableSetupOpen,
        selectWorkflowStep,
        openVariableSetup,
        saveVariableSetup,
        saveVariableSetupAndRun,
      },
      run: {
        runModel: handleRunModel,
        cancelRunTask,
        closeRunFailureDialog,
        replaceRunState,
      },
      snapshots: {
        setSnapshotViewFilter,
        setSnapshotNameDraft,
        setSelectedSnapshotIds,
        setIsSnapshotManageMode,
        saveSnapshot,
        restoreSnapshot,
        startRenameSnapshot,
        cancelRenameSnapshot,
        commitRenameSnapshot,
        toggleSnapshotFlag,
        toggleSnapshotSelection,
        toggleAllSnapshots,
        setSelectedSnapshotFlag,
        updateSnapshotNote,
        setSnapshotTags,
        toggleSnapshotTag,
        deleteSelectedSnapshots,
        deleteSnapshot,
      },
    },
  }
}
