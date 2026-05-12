import { useMemo, useState } from 'react'
import writeXlsxFile from 'write-excel-file/browser'
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
import {
  fieldRoleLabel,
  fieldRoleValue,
  hasField,
  summarizeFields,
} from './data/dataRoles'
import {
  snapshotFilterOptions,
} from './data/snapshots'
import { isMissingCell } from './data/missingValues'
import { buildPublicationTableHtml, publicationSheetData, publicationTableCss } from './export/publicationRenderers'
import { publicationTableToRows } from './export/publicationTables'
import { buildCsvReport, buildExcelBlob, buildHtmlReport, buildJsonReport, csvLine } from './export/reportExport'
import type { ColumnType, Row } from './data/types'
import type { ParameterField } from './models/modelConfig'
import { getModelMaturity, getModelPlugin, getModelTaskGroup, getModelUseCase } from './models/registry'
import type { InferenceConfig, ModelParamValue, SpatialWeightsParam } from './models/types'
import { formatDuration } from './workers/runProgress'
import type { WorkflowStep } from './hooks/useModelRun'
import { usePublicationWorkbench } from './hooks/usePublicationWorkbench'
import { useWorkbenchSession } from './hooks/useWorkbenchSession'
import { deriveResultInsights } from './components/results/resultInsights'
import { ResultReadingPanel } from './components/results'
import { CustomPublicationExportSummary, CustomPublicationWorkbench } from './components/report'
import {
  allModelCategory,
  dataPreviewOverscanRows,
  dataPreviewRowHeight,
  dataPreviewVisibleRows,
} from './constants/workbench'
import './App.css'

const typeOptions: ColumnType[] = ['numeric', 'category', 'date', 'text', 'empty']

const previewValue = (value: Row[string]) => {
  if (value === null || value === undefined || value === '') return 'NA'
  return String(value)
}

type WorkspaceTab = 'workbench' | 'publication'

type ExportFormat = 'csv' | 'excel' | 'html' | 'word' | 'json'

type ExportItem = {
  id: string
  label: string
  detail: string
  kind: 'summary' | 'table' | 'report' | 'meta'
}

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

const asParamString = (value: ModelParamValue | undefined) => {
  if (Array.isArray(value)) return value[0] ?? ''
  if (value && typeof value === 'object') return ''
  return value === undefined ? '' : String(value)
}

const asParamArray = (value: ModelParamValue | undefined) => (Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [])

const asSpatialWeightsParam = (value: ModelParamValue | undefined): SpatialWeightsParam | null =>
  value && typeof value === 'object' && !Array.isArray(value) && value.kind === 'spatial-weights' ? value : null

function App() {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')
  const [selectedExportItemIds, setSelectedExportItemIds] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('workbench')
  const [dataPreviewScrollTop, setDataPreviewScrollTop] = useState(0)

  const session = useWorkbenchSession({
    workspaceTab,
    isExportModalOpen,
    onSwitchModel: () => setWorkspaceTab('workbench'),
  })

  const { data, model, workflow, run, snapshots: snapshotState, actions } = session
  const {
    rows,
    fileName,
    uploadError,
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
    numericColumns,
    panelDiagnosis,
    hasRoleSetting,
  } = data
  const {
    activeModelId,
    activeModel,
    draftModel,
    hasActiveModel,
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
    modelMaturity,
    modelCategories,
    filteredModelPlugins,
    recentModelPlugins,
    parameterSections,
    validationIssues,
    validationErrors,
    activeFormula,
  } = model
  const {
    isVariableSetupOpen,
    effectiveWorkflowStep,
    workspaceMode,
    canImportData,
    hasStaleResult,
  } = workflow
  const {
    currentRunSignature,
    result,
    mainResultTable,
    secondaryResultTables,
    modelError,
    runLogs,
    runState,
    runTask,
    runFailureDialog,
    isModelRunning,
  } = run
  const {
    snapshotViewFilter,
    snapshots,
    renamingSnapshotId,
    snapshotNameDraft,
    selectedSnapshotIds,
    isSnapshotManageMode,
    selectedSnapshotIdSet,
    visibleSnapshots,
    visibleSnapshotIds,
    selectedSnapshotsAllPinned,
    selectedSnapshotsAllFavorite,
    snapshotSummaryText,
  } = snapshotState

  const setIsDataModalOpen = actions.data.setIsDataModalOpen
  const setPendingImport = actions.data.setPendingImport
  const setDataFieldRole = actions.data.setDataFieldRole
  const handleUpload = actions.data.handleUpload
  const updateColumnType = actions.data.updateColumnType
  const togglePendingRoleField = actions.data.togglePendingRoleField
  const setPendingTimeField = actions.data.setPendingTimeField
  const continueImportAfterMissingAlert = actions.data.continueImportAfterMissingAlert
  const cancelMissingValueImport = actions.data.cancelMissingValueImport
  const confirmImport = actions.data.confirmImport

  const setInferenceConfig = actions.model.setInferenceConfig
  const setModelConfig = actions.model.setModelConfig
  const setIsModelLibraryOpen = actions.model.setIsModelLibraryOpen
  const setModelSearch = actions.model.setModelSearch
  const setSelectedModelCategory = actions.model.setSelectedModelCategory
  const setDraftModelId = actions.model.setDraftModelId
  const openModelLibrary = actions.model.openModelLibrary
  const applyDraftModel = actions.model.applyDraftModel
  const toggleFeature = actions.model.toggleFeature
  const setSchemaParamColumn = actions.model.setSchemaParamColumn
  const setParamNumber = actions.model.setParamNumber
  const setParamValue = actions.model.setParamValue
  const importSpatialWeights = actions.model.importSpatialWeights
  const toggleParamColumn = actions.model.toggleParamColumn

  const setWorkflowStep = actions.workflow.setWorkflowStep
  const setIsVariableSetupOpen = actions.workflow.setIsVariableSetupOpen
  const openVariableSetup = actions.workflow.openVariableSetup
  const saveVariableSetup = actions.workflow.saveVariableSetup
  const saveVariableSetupAndRun = actions.workflow.saveVariableSetupAndRun
  const handleRunModel = actions.run.runModel
  const cancelRunTask = actions.run.cancelRunTask
  const closeRunFailureDialog = actions.run.closeRunFailureDialog
  const saveSnapshot = actions.snapshots.saveSnapshot
  const restoreSnapshot = actions.snapshots.restoreSnapshot
  const setSnapshotViewFilter = actions.snapshots.setSnapshotViewFilter
  const setSnapshotNameDraft = actions.snapshots.setSnapshotNameDraft
  const setSelectedSnapshotIds = actions.snapshots.setSelectedSnapshotIds
  const setIsSnapshotManageMode = actions.snapshots.setIsSnapshotManageMode
  const startRenameSnapshot = actions.snapshots.startRenameSnapshot
  const cancelRenameSnapshot = actions.snapshots.cancelRenameSnapshot
  const commitRenameSnapshot = actions.snapshots.commitRenameSnapshot
  const toggleSnapshotFlag = actions.snapshots.toggleSnapshotFlag
  const toggleSnapshotSelection = actions.snapshots.toggleSnapshotSelection
  const toggleAllSnapshots = actions.snapshots.toggleAllSnapshots
  const setSelectedSnapshotFlag = actions.snapshots.setSelectedSnapshotFlag
  const deleteSelectedSnapshots = actions.snapshots.deleteSelectedSnapshots
  const deleteSnapshot = actions.snapshots.deleteSnapshot

  const virtualPreviewStart = Math.max(0, Math.floor(dataPreviewScrollTop / dataPreviewRowHeight) - dataPreviewOverscanRows)
  const virtualPreviewEnd = Math.min(rows.length, virtualPreviewStart + dataPreviewVisibleRows + dataPreviewOverscanRows * 2)
  const virtualPreviewRows = useMemo(() => rows.slice(virtualPreviewStart, virtualPreviewEnd), [rows, virtualPreviewEnd, virtualPreviewStart])
  const resultInsights = useMemo(() => deriveResultInsights(result), [result])
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
  const modelContextLead =
    !isModelRunning && modelError
      ? `模型运行失败，请调整变量后重试：${modelError}`
      : validationErrors.length > 0
      ? validationErrors[0].message
      : activeModel.requiresTarget
        ? `${activeModel.targetLabel}已选为 ${selectedTarget || '未设置'}，${activeModel.featuresLabel}当前为 ${selectedFeatureSummary}。`
        : `${activeModel.featuresLabel}当前为 ${selectedFeatureSummary}。`
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

  const downloadBlob = (content: BlobPart[], type: string, filename: string) => {
    const blob = new Blob(content, { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const selectedExportItemSet = useMemo(() => new Set(selectedExportItemIds), [selectedExportItemIds])
  const isPublicationPreviewEnabled = workspaceTab === 'publication' || (isExportModalOpen && selectedExportItemSet.has('custom-publication'))
  const publicationWorkbench = usePublicationWorkbench({
    result,
    hasActiveModel,
    activeModel: hasActiveModel ? activeModel : null,
    sanitizedConfig,
    dataRoles,
    snapshots,
    isPreviewEnabled: isPublicationPreviewEnabled,
    getModelShortName: (modelId) => getModelPlugin(modelId).shortName,
  })
  const { state: publicationState, actions: publicationActions, builders: publicationBuilders } = publicationWorkbench
  const customPublicationConfig = publicationState.config
  const customPublicationTemplates = publicationState.templates
  const customPublicationDefaultTemplateId = publicationState.defaultTemplateId
  const publicationSources = publicationState.sources
  const hasPublicationSources = publicationState.hasPublicationSources
  const effectiveCustomPublicationSourceIds = publicationState.effectiveSourceIds
  const customPublicationSelectedSet = publicationState.selectedSourceIds
  const selectedPublicationSources = publicationState.selectedSources
  const orderedCustomPublicationVariableOptions = publicationState.variableOptions
  const customPublicationStatisticOptions = publicationState.statisticOptions
  const hiddenCustomPublicationVariableSet = publicationState.hiddenVariableIds
  const disabledCustomPublicationStatisticSet = publicationState.disabledStatisticIds
  const isCustomPublicationDefaultTableMode = publicationState.isDefaultTableMode
  const customPublicationPreviewTable = publicationState.previewTable
  const customPublicationPreviewHtml = publicationState.previewHtml
  const canExportCustomPublication = publicationState.canExport && !isExporting
  const customPublicationEnabled = selectedExportItemSet.has('custom-publication')
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

  const getExportSelection = () => (selectedExportItemIds.length > 0 ? selectedExportItemIds : exportItems.map((item) => item.id))

  const buildPublicationRegressionTable = publicationBuilders.buildBaselinePublicationTable
  const buildCustomPublicationTableFromConfig = publicationBuilders.buildCustomPublicationTable
  const startCustomPublicationEditing = publicationActions.startCustom
  const updateCustomPublicationConfig = publicationActions.updateText
  const updateCustomPublicationFormatRules = publicationActions.updateFormatRules
  const toggleCustomPublicationSource = publicationActions.toggleSource
  const updateCustomPublicationColumn = publicationActions.updateColumn
  const moveCustomPublicationColumn = publicationActions.moveColumn
  const updateCustomPublicationVariableLabel = publicationActions.updateVariableLabel
  const toggleCustomPublicationVariable = publicationActions.toggleVariable
  const moveCustomPublicationVariable = publicationActions.moveVariable
  const moveCustomPublicationStatistic = publicationActions.moveStatistic
  const updateCustomPublicationStatisticLabel = publicationActions.updateStatisticLabel
  const toggleCustomPublicationStatistic = publicationActions.toggleStatistic
  const resetCustomPublicationOrdering = publicationActions.resetOrdering
  const setAllCustomPublicationVariables = publicationActions.setAllVariables
  const setAllCustomPublicationStatistics = publicationActions.setAllStatistics
  const saveCustomPublicationTemplate = publicationActions.saveTemplate
  const restoreCustomPublicationDefaults = publicationActions.restoreDefaults

  const openPublicationWorkbench = () => {
    setExportError('')
    setIsExportModalOpen(false)
    setWorkspaceTab('publication')
  }

  const closePublicationWorkbench = () => {
    setExportError('')
    setWorkspaceTab('workbench')
  }

  const applyCustomPublicationTemplate = publicationActions.applyTemplate
  const applyDefaultCustomPublicationTemplate = publicationActions.applyDefaultTemplate
  const duplicateCustomPublicationTemplate = publicationActions.duplicateTemplate
  const renameCustomPublicationTemplate = publicationActions.renameTemplate
  const deleteCustomPublicationTemplate = publicationActions.deleteTemplate
  const reorderCustomPublicationByDrop = publicationActions.dropItem

  const buildReportExportContext = (selectedIds = getExportSelection()) => {
    if (!result || !hasActiveModel) return null
    return {
      result,
      config: sanitizedConfig,
      selectedIds,
      model: {
        id: activeModel.id,
        name: activeModel.name,
        shortName: activeModel.shortName,
        formula: activeModel.getFormula(sanitizedConfig),
        downloadName: activeModel.downloadName,
      },
      maturity: {
        label: modelMaturity.label,
        description: modelMaturity.description,
      },
      runLogs,
      baselinePublicationTable: buildPublicationRegressionTable(),
      customPublicationTable: selectedIds.includes('custom-publication') ? buildCustomPublicationTableFromConfig() : null,
    }
  }

  const exportReport = async (format: ExportFormat = exportFormat, selectedIds = getExportSelection()) => {
    if (!result || !hasActiveModel) return
    if (selectedIds.length === 0) return
    const context = buildReportExportContext(selectedIds)
    if (!context) return

    if (format === 'excel') {
      downloadBlob([await buildExcelBlob(context)], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${activeModel.id}-report.xlsx`)
      return
    }
    if (format === 'html') {
      downloadBlob([buildHtmlReport(context)], 'text/html;charset=utf-8', `${activeModel.id}-report.html`)
      return
    }
    if (format === 'word') {
      downloadBlob(['\uFEFF', buildHtmlReport(context)], 'application/msword;charset=utf-8', `${activeModel.id}-report.doc`)
      return
    }
    if (format === 'json') {
      downloadBlob([buildJsonReport(context)], 'application/json;charset=utf-8', `${activeModel.id}-export.json`)
      return
    }
    downloadBlob(['\uFEFF', buildCsvReport(context)], 'text/csv;charset=utf-8', activeModel.downloadName)
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

  const visiblePublicationVariableCount = publicationState.visibleVariableCount
  const enabledPublicationStatisticCount = publicationState.enabledStatisticCount
  const customPublicationDisplayTitle = publicationState.displayTitle
  const publicationTemplateStatus = publicationState.templateStatus

  const renderCustomPublicationWorkbench = () => (
    <CustomPublicationWorkbench
      config={customPublicationConfig}
      sources={publicationSources}
      selectedSources={selectedPublicationSources}
      selectedSourceIds={customPublicationSelectedSet}
      variableOptions={orderedCustomPublicationVariableOptions}
      statisticOptions={customPublicationStatisticOptions}
      hiddenVariableIds={hiddenCustomPublicationVariableSet}
      disabledStatisticIds={disabledCustomPublicationStatisticSet}
      templates={customPublicationTemplates}
      defaultTemplateId={customPublicationDefaultTemplateId}
      previewTable={customPublicationPreviewTable}
      previewHtml={customPublicationPreviewHtml}
      displayTitle={customPublicationDisplayTitle}
      templateStatus={publicationTemplateStatus}
      isDefaultTableMode={isCustomPublicationDefaultTableMode}
      isExporting={isExporting}
      canExport={canExportCustomPublication}
      exportError={workspaceTab === 'publication' ? exportError : ''}
      onClose={closePublicationWorkbench}
      onExport={exportCustomPublicationOnly}
      onStartCustom={startCustomPublicationEditing}
      onRestoreDefaults={restoreCustomPublicationDefaults}
      onResetOrdering={resetCustomPublicationOrdering}
      onSaveTemplate={saveCustomPublicationTemplate}
      onApplyDefaultTemplate={applyDefaultCustomPublicationTemplate}
      onUpdateText={updateCustomPublicationConfig}
      onUpdateFormatRules={updateCustomPublicationFormatRules}
      onToggleSource={toggleCustomPublicationSource}
      onUpdateColumn={updateCustomPublicationColumn}
      onMoveColumn={moveCustomPublicationColumn}
      onToggleVariable={toggleCustomPublicationVariable}
      onMoveVariable={moveCustomPublicationVariable}
      onUpdateVariableLabel={updateCustomPublicationVariableLabel}
      onSetAllVariables={setAllCustomPublicationVariables}
      onToggleStatistic={toggleCustomPublicationStatistic}
      onMoveStatistic={moveCustomPublicationStatistic}
      onUpdateStatisticLabel={updateCustomPublicationStatisticLabel}
      onSetAllStatistics={setAllCustomPublicationStatistics}
      onSetDraggingItem={publicationActions.setDraggingItem}
      onDropItem={reorderCustomPublicationByDrop}
      onApplyTemplate={applyCustomPublicationTemplate}
      onDuplicateTemplate={duplicateCustomPublicationTemplate}
      onRenameTemplate={renameCustomPublicationTemplate}
      onSetDefaultTemplate={publicationActions.setDefaultTemplate}
      onDeleteTemplate={deleteCustomPublicationTemplate}
    />
  )

  const renderCustomPublicationExportSummary = () => (
    <CustomPublicationExportSummary
      displayTitle={customPublicationDisplayTitle}
      selectedSourceCount={selectedPublicationSources.length}
      visibleVariableCount={visiblePublicationVariableCount}
      enabledStatisticCount={enabledPublicationStatisticCount}
      templateStatus={publicationTemplateStatus}
      hasDefaultTemplate={Boolean(customPublicationDefaultTemplateId)}
      hasResult={Boolean(result)}
      onOpen={openPublicationWorkbench}
    />
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
              <button className="ghost-button" type="button" onClick={closeRunFailureDialog} title="关闭">
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
                  closeRunFailureDialog()
                  openVariableSetup()
                }}
              >
                返回变量设定
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  closeRunFailureDialog()
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
