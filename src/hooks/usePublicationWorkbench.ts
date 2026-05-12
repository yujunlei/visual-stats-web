import { useEffect, useMemo, useState } from 'react'
import type { DataRoles } from '../data/dataRoles'
import type { ModelConfig, ModelPlugin, ModelResult } from '../models/types'
import {
  customPublicationDefaultTemplateStorageKey,
  customPublicationDraftStorageKey,
  customPublicationTemplateStorageKey,
  defaultCustomPublicationConfig,
  loadCustomPublicationDefaultTemplateId,
  loadCustomPublicationDraft,
  loadCustomPublicationTemplates,
  type CustomPublicationColumnDraft,
  type CustomPublicationConfig,
  type CustomPublicationFormatRules,
  type CustomPublicationTemplate,
} from '../export/customPublicationConfig'
import {
  applyCustomPublicationTemplateConfig,
  createCustomPublicationTemplate,
  customPublicationAsCustom,
  moveCustomPublicationColumn as moveCustomPublicationColumnConfig,
  moveCustomPublicationStatistic as moveCustomPublicationStatisticConfig,
  moveCustomPublicationVariable as moveCustomPublicationVariableConfig,
  reorderCustomPublicationByDrop as reorderCustomPublicationConfigByDrop,
  resetCustomPublicationOrdering as resetCustomPublicationConfigOrdering,
  setAllCustomPublicationStatistics as setAllCustomPublicationConfigStatistics,
  setAllCustomPublicationVariables as setAllCustomPublicationConfigVariables,
  toggleCustomPublicationSource as toggleCustomPublicationConfigSource,
  toggleCustomPublicationStatistic as toggleCustomPublicationConfigStatistic,
  toggleCustomPublicationVariable as toggleCustomPublicationConfigVariable,
  updateCustomPublicationColumn as updateCustomPublicationConfigColumn,
  updateCustomPublicationFormatRules as updateCustomPublicationConfigFormatRules,
  updateCustomPublicationStatisticLabel as updateCustomPublicationConfigStatisticLabel,
  updateCustomPublicationText,
  updateCustomPublicationVariableLabel as updateCustomPublicationConfigVariableLabel,
  type CustomPublicationDirection,
  type CustomPublicationDragItem,
} from '../export/customPublicationActions'
import { buildCustomPublicationTableFromConfig as resolveCustomPublicationTableFromConfig } from '../export/customPublicationBuilder'
import {
  getCustomPublicationStatisticOptions,
  getCustomPublicationVariableOptions,
  orderCustomPublicationOptions,
  resolveSelectedPublicationSources,
  type CustomPublicationOption,
  type CustomPublicationStatisticOption,
} from '../export/customPublicationOptions'
import { buildPublicationSources, hasCoefficientPublicationSource, type PublicationSnapshotSource } from '../export/publicationSources'
import { buildPublicationTableHtml } from '../export/publicationRenderers'
import { buildBaselinePublicationTable as resolveBaselinePublicationTable, type CustomPublicationSource, type PublicationTable } from '../export/publicationTables'

type StateSetter<T> = (value: T | ((current: T) => T)) => void

export type UsePublicationWorkbenchInput = {
  result: ModelResult | null
  hasActiveModel: boolean
  activeModel: ModelPlugin | null
  sanitizedConfig: ModelConfig
  dataRoles: DataRoles
  snapshots: PublicationSnapshotSource[]
  isPreviewEnabled: boolean
  getModelShortName?: (modelId: string) => string
  createId?: () => string
  getNow?: () => string
}

export type PublicationWorkbenchState = {
  config: CustomPublicationConfig
  templates: CustomPublicationTemplate[]
  defaultTemplateId: string
  draggingItem: CustomPublicationDragItem | null
  sources: CustomPublicationSource[]
  selectedSources: CustomPublicationSource[]
  selectedSourceIds: Set<string>
  defaultSourceIds: string[]
  effectiveSourceIds: string[]
  variableOptions: CustomPublicationOption[]
  statisticOptions: CustomPublicationStatisticOption[]
  hiddenVariableIds: Set<string>
  disabledStatisticIds: Set<string>
  options: {
    variables: CustomPublicationOption[]
    statistics: CustomPublicationStatisticOption[]
  }
  sets: {
    selectedSourceIds: Set<string>
    hiddenVariableIds: Set<string>
    disabledStatisticIds: Set<string>
  }
  previewTable: PublicationTable | null
  previewHtml: string
  displayTitle: string
  templateStatus: string
  isDefaultTableMode: boolean
  hasPublicationSources: boolean
  canExport: boolean
  visibleVariableCount: number
  enabledStatisticCount: number
}

export type PublicationWorkbenchActions = {
  startCustom: () => void
  restoreDefaults: () => void
  resetOrdering: () => void
  saveTemplate: () => void
  applyDefaultTemplate: () => void
  updateText: (patch: Partial<Pick<CustomPublicationConfig, 'title' | 'note'>>) => void
  updateFormatRules: (patch: Partial<CustomPublicationFormatRules>) => void
  toggleSource: (sourceId: string) => void
  updateColumn: (sourceId: string, patch: Partial<Omit<CustomPublicationColumnDraft, 'id'>>) => void
  moveColumn: (sourceId: string, direction: CustomPublicationDirection) => void
  toggleVariable: (variableId: string) => void
  moveVariable: (variableId: string, direction: CustomPublicationDirection) => void
  updateVariableLabel: (variableId: string, label: string) => void
  setAllVariables: (visible: boolean) => void
  toggleStatistic: (statisticId: string) => void
  moveStatistic: (statisticId: string, direction: CustomPublicationDirection) => void
  updateStatisticLabel: (statisticId: string, label: string) => void
  setAllStatistics: (enabled: boolean) => void
  setDraggingItem: (item: CustomPublicationDragItem | null) => void
  dropItem: (kind: CustomPublicationDragItem['kind'], targetId: string) => void
  applyTemplate: (templateId: string) => void
  duplicateTemplate: (templateId: string) => void
  renameTemplate: (templateId: string, name: string) => void
  setDefaultTemplate: (templateId: string) => void
  deleteTemplate: (templateId: string) => void
}

export type PublicationWorkbenchBuilders = {
  buildBaselinePublicationTable: () => PublicationTable | null
  buildCustomPublicationTable: () => PublicationTable | null
}

export type PublicationWorkbenchModel = {
  state: PublicationWorkbenchState
  actions: PublicationWorkbenchActions
  builders: PublicationWorkbenchBuilders
}

export type PublicationWorkbenchBuilderInput = {
  result: ModelResult | null
  hasActiveModel: boolean
  activeModel: ModelPlugin | null
  sanitizedConfig: ModelConfig
  dataRoles: DataRoles
  config: CustomPublicationConfig
  isDefaultTableMode: boolean
  selectedSources: CustomPublicationSource[]
  orderedVariableOptions: CustomPublicationOption[]
  statisticOptions: CustomPublicationStatisticOption[]
  hiddenVariableIds: Set<string>
  disabledStatisticIds: Set<string>
}

export type PublicationWorkbenchActionInput = {
  config: CustomPublicationConfig
  templates: CustomPublicationTemplate[]
  defaultTemplateId: string
  defaultSourceIds: string[]
  effectiveSourceIds: string[]
  selectedSources: CustomPublicationSource[]
  variableOptions: CustomPublicationOption[]
  orderedVariableOptions: CustomPublicationOption[]
  statisticOptions: CustomPublicationStatisticOption[]
  draggingItem: CustomPublicationDragItem | null
  setConfig: StateSetter<CustomPublicationConfig>
  setTemplates: StateSetter<CustomPublicationTemplate[]>
  setDefaultTemplateId: StateSetter<string>
  setDraggingItem: StateSetter<CustomPublicationDragItem | null>
  createId: () => string
  getNow: () => string
}

export type PublicationWorkbenchPreviewInput = {
  isPreviewEnabled: boolean
  hasPublicationSources: boolean
  buildTable: () => PublicationTable | null
  buildHtml?: (table: PublicationTable) => string
}

export const createPublicationConfigSignature = (config: CustomPublicationConfig) => JSON.stringify(config)

export const createPublicationTemplateSignatures = (templates: CustomPublicationTemplate[]) =>
  new Map(templates.map((template) => [template.id, createPublicationConfigSignature(template.config)]))

export const findMatchingPublicationTemplate = (
  templates: CustomPublicationTemplate[],
  templateSignatures: Map<string, string>,
  configSignature: string,
) => templates.find((template) => templateSignatures.get(template.id) === configSignature) ?? null

export const resolveCleanDefaultTemplateId = (defaultTemplateId: string, templates: CustomPublicationTemplate[]) =>
  defaultTemplateId && !templates.some((template) => template.id === defaultTemplateId) ? '' : defaultTemplateId

export const getPublicationTemplateStatus = ({
  matchedTemplate,
  isDefaultTableMode,
  defaultTemplateId,
}: {
  matchedTemplate: CustomPublicationTemplate | null
  isDefaultTableMode: boolean
  defaultTemplateId: string
}) => {
  if (matchedTemplate) return `当前使用模板：${matchedTemplate.name}`
  if (isDefaultTableMode) return '默认同款：当前结果论文三线表'
  if (defaultTemplateId) return '当前为草稿状态，可随时应用默认模板'
  return '当前为未命名草稿'
}

export const canExportPublicationTable = ({
  isDefaultTableMode,
  result,
  hasActiveModel,
  selectedSources,
}: {
  isDefaultTableMode: boolean
  result: ModelResult | null
  hasActiveModel: boolean
  selectedSources: CustomPublicationSource[]
}) =>
  isDefaultTableMode
    ? Boolean(result && hasActiveModel && result.tables.some((table) => table.id === 'coefficients'))
    : hasCoefficientPublicationSource(selectedSources)

export function buildPublicationWorkbenchPreview({
  isPreviewEnabled,
  hasPublicationSources,
  buildTable,
  buildHtml = buildPublicationTableHtml,
}: PublicationWorkbenchPreviewInput) {
  if (!isPreviewEnabled || !hasPublicationSources) {
    return { previewTable: null, previewHtml: '' }
  }

  const previewTable = buildTable()
  return {
    previewTable,
    previewHtml: previewTable ? buildHtml(previewTable) : '',
  }
}

export function createPublicationWorkbenchBuilders({
  result,
  hasActiveModel,
  activeModel,
  sanitizedConfig,
  dataRoles,
  config,
  isDefaultTableMode,
  selectedSources,
  orderedVariableOptions,
  statisticOptions,
  hiddenVariableIds,
  disabledStatisticIds,
}: PublicationWorkbenchBuilderInput): PublicationWorkbenchBuilders {
  const buildBaselinePublicationTable = () => {
    if (!result || !hasActiveModel || !activeModel) return null
    return resolveBaselinePublicationTable({
      result,
      config: sanitizedConfig,
      dimensions: dataRoles,
      modelLabel: activeModel.shortName || activeModel.name,
      methodLabel: activeModel.methodLabel || activeModel.shortName || activeModel.name,
    })
  }

  const buildCustomPublicationTable = () =>
    resolveCustomPublicationTableFromConfig({
      config,
      isDefaultTableMode,
      baselineTable: buildBaselinePublicationTable(),
      selectedSources,
      orderedVariableOptions,
      statisticOptions,
      hiddenVariableIds,
      disabledStatisticIds,
    })

  return {
    buildBaselinePublicationTable,
    buildCustomPublicationTable,
  }
}

const defaultCreateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const defaultGetNow = () => new Date().toISOString()

export function createPublicationWorkbenchActions({
  config,
  templates,
  defaultTemplateId,
  defaultSourceIds,
  effectiveSourceIds,
  selectedSources,
  variableOptions,
  orderedVariableOptions,
  statisticOptions,
  draggingItem,
  setConfig,
  setTemplates,
  setDefaultTemplateId,
  setDraggingItem,
  createId,
  getNow,
}: PublicationWorkbenchActionInput): PublicationWorkbenchActions {
  const applyTemplate = (templateId: string) => {
    const template = templates.find((entry) => entry.id === templateId)
    if (!template) return
    setConfig(applyCustomPublicationTemplateConfig(template.config, defaultSourceIds))
  }

  return {
    startCustom: () => {
      setConfig((current) => customPublicationAsCustom(current, defaultSourceIds))
    },
    restoreDefaults: () => {
      setConfig(defaultCustomPublicationConfig())
    },
    resetOrdering: () => {
      setConfig((current) => resetCustomPublicationConfigOrdering(current, defaultSourceIds))
    },
    saveTemplate: () => {
      const name = config.title.trim() || `自定义论文表模板 ${templates.length + 1}`
      const template = createCustomPublicationTemplate(config, defaultSourceIds, name, createId(), getNow())
      setTemplates((current) => [template, ...current.filter((entry) => entry.name !== name)])
    },
    applyDefaultTemplate: () => {
      if (defaultTemplateId) applyTemplate(defaultTemplateId)
    },
    updateText: (patch) => {
      setConfig((current) => updateCustomPublicationText(current, defaultSourceIds, patch))
    },
    updateFormatRules: (patch) => {
      setConfig((current) => updateCustomPublicationConfigFormatRules(current, defaultSourceIds, patch))
    },
    toggleSource: (sourceId) => {
      setConfig((current) => toggleCustomPublicationConfigSource(current, sourceId, defaultSourceIds, effectiveSourceIds))
    },
    updateColumn: (sourceId, patch) => {
      setConfig((current) => updateCustomPublicationConfigColumn(current, defaultSourceIds, sourceId, patch))
    },
    moveColumn: (sourceId, direction) => {
      const availableIds = selectedSources.map((source) => source.id)
      setConfig((current) => moveCustomPublicationColumnConfig(current, defaultSourceIds, sourceId, direction, availableIds))
    },
    toggleVariable: (variableId) => {
      setConfig((current) => toggleCustomPublicationConfigVariable(current, defaultSourceIds, variableId))
    },
    moveVariable: (variableId, direction) => {
      const availableIds = variableOptions.map((option) => option.id)
      setConfig((current) => moveCustomPublicationVariableConfig(current, defaultSourceIds, variableId, direction, availableIds))
    },
    updateVariableLabel: (variableId, label) => {
      setConfig((current) => updateCustomPublicationConfigVariableLabel(current, defaultSourceIds, variableId, label))
    },
    setAllVariables: (visible) => {
      const variableIds = orderedVariableOptions.map((option) => option.id)
      setConfig((current) => setAllCustomPublicationConfigVariables(current, defaultSourceIds, visible, variableIds))
    },
    toggleStatistic: (statisticId) => {
      setConfig((current) => toggleCustomPublicationConfigStatistic(current, defaultSourceIds, statisticId))
    },
    moveStatistic: (statisticId, direction) => {
      const availableIds = statisticOptions.map((option) => option.id)
      setConfig((current) => moveCustomPublicationStatisticConfig(current, defaultSourceIds, statisticId, direction, availableIds))
    },
    updateStatisticLabel: (statisticId, label) => {
      setConfig((current) => updateCustomPublicationConfigStatisticLabel(current, defaultSourceIds, statisticId, label))
    },
    setAllStatistics: (enabled) => {
      const statisticIds = statisticOptions.map((option) => option.id)
      setConfig((current) => setAllCustomPublicationConfigStatistics(current, defaultSourceIds, enabled, statisticIds))
    },
    setDraggingItem,
    dropItem: (kind, targetId) => {
      const availableIdsByKind = {
        column: selectedSources.map((source) => source.id),
        variable: orderedVariableOptions.map((option) => option.id),
        statistic: statisticOptions.map((option) => option.id),
      }
      setConfig((current) => reorderCustomPublicationConfigByDrop(current, defaultSourceIds, draggingItem, kind, targetId, availableIdsByKind))
      setDraggingItem(null)
    },
    applyTemplate,
    duplicateTemplate: (templateId) => {
      const template = templates.find((entry) => entry.id === templateId)
      if (!template) return
      setTemplates((current) => [
        {
          ...template,
          id: createId(),
          name: `${template.name}（副本）`,
          updatedAt: getNow(),
          config: structuredClone(template.config),
        },
        ...current,
      ])
    },
    renameTemplate: (templateId, name) => {
      setTemplates((current) => current.map((entry) => (entry.id === templateId ? { ...entry, name, updatedAt: getNow() } : entry)))
    },
    setDefaultTemplate: (templateId) => {
      setDefaultTemplateId(templates.some((template) => template.id === templateId) ? templateId : '')
    },
    deleteTemplate: (templateId) => {
      setTemplates((current) => current.filter((entry) => entry.id !== templateId))
      setDefaultTemplateId((current) => (current === templateId ? '' : current))
    },
  }
}

const persistPublicationWorkbenchValue = (key: string, value: string) => {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, value)
  } catch {
    // Publication workbench persistence is best-effort and must not block modeling.
  }
}

export function usePublicationWorkbench({
  result,
  hasActiveModel,
  activeModel,
  sanitizedConfig,
  dataRoles,
  snapshots,
  isPreviewEnabled,
  getModelShortName,
  createId = defaultCreateId,
  getNow = defaultGetNow,
}: UsePublicationWorkbenchInput): PublicationWorkbenchModel {
  const [config, setConfig] = useState<CustomPublicationConfig>(loadCustomPublicationDraft)
  const [templates, setTemplates] = useState<CustomPublicationTemplate[]>(loadCustomPublicationTemplates)
  const [defaultTemplateId, setDefaultTemplateId] = useState(loadCustomPublicationDefaultTemplateId)
  const [draggingItem, setDraggingItem] = useState<CustomPublicationDragItem | null>(null)
  const cleanDefaultTemplateId = useMemo(() => resolveCleanDefaultTemplateId(defaultTemplateId, templates), [defaultTemplateId, templates])

  useEffect(() => {
    persistPublicationWorkbenchValue(customPublicationTemplateStorageKey, JSON.stringify(templates))
  }, [templates])

  useEffect(() => {
    persistPublicationWorkbenchValue(customPublicationDefaultTemplateStorageKey, cleanDefaultTemplateId)
  }, [cleanDefaultTemplateId])

  useEffect(() => {
    persistPublicationWorkbenchValue(customPublicationDraftStorageKey, JSON.stringify(config))
  }, [config])

  const sources = useMemo(
    () =>
      buildPublicationSources({
        current:
          result && hasActiveModel && activeModel
            ? {
                result,
                config: sanitizedConfig,
                dimensions: dataRoles,
                modelName: activeModel.name,
                modelShortName: activeModel.shortName || activeModel.name,
                formula: activeModel.getFormula(sanitizedConfig),
              }
            : undefined,
        snapshots,
        getModelShortName: getModelShortName ?? ((modelId) => modelId),
      }),
    [activeModel, dataRoles, getModelShortName, hasActiveModel, result, sanitizedConfig, snapshots],
  )
  const hasPublicationSources = useMemo(() => hasCoefficientPublicationSource(sources), [sources])
  const hasCurrentPublicationSource = useMemo(() => sources.some((source) => source.id === 'current'), [sources])
  const defaultSourceIds = useMemo(() => (hasCurrentPublicationSource ? ['current'] : []), [hasCurrentPublicationSource])
  const effectiveSourceIds = useMemo(
    () => (config.selectedSourceIds.length > 0 ? config.selectedSourceIds : defaultSourceIds),
    [config.selectedSourceIds, defaultSourceIds],
  )
  const selectedSourceIds = useMemo(() => new Set(effectiveSourceIds), [effectiveSourceIds])
  const selectedSources = useMemo(
    () => resolveSelectedPublicationSources(sources, selectedSourceIds, config.columnOrder),
    [config.columnOrder, selectedSourceIds, sources],
  )
  const variableOptions = useMemo(
    () => getCustomPublicationVariableOptions(selectedSources, config.variableLabels),
    [config.variableLabels, selectedSources],
  )
  const orderedVariableOptions = useMemo(
    () => orderCustomPublicationOptions(variableOptions, config.variableOrder),
    [config.variableOrder, variableOptions],
  )
  const hiddenVariableIds = useMemo(() => new Set(config.hiddenVariableIds), [config.hiddenVariableIds])
  const statisticOptions = useMemo(
    () => getCustomPublicationStatisticOptions(selectedSources, config.statisticLabels, config.statisticOrder),
    [config.statisticLabels, config.statisticOrder, selectedSources],
  )
  const disabledStatisticIds = useMemo(() => new Set(config.disabledStatisticIds), [config.disabledStatisticIds])
  const isDefaultTableMode = config.mode === 'current-three-line' && Boolean(result && hasActiveModel)

  const builders = useMemo(
    () =>
      createPublicationWorkbenchBuilders({
        result,
        hasActiveModel,
        activeModel,
        sanitizedConfig,
        dataRoles,
        config,
        isDefaultTableMode,
        selectedSources,
        orderedVariableOptions,
        statisticOptions,
        hiddenVariableIds,
        disabledStatisticIds,
      }),
    [
      activeModel,
      config,
      dataRoles,
      disabledStatisticIds,
      hasActiveModel,
      hiddenVariableIds,
      isDefaultTableMode,
      orderedVariableOptions,
      result,
      sanitizedConfig,
      selectedSources,
      statisticOptions,
    ],
  )

  const { previewTable, previewHtml } = useMemo(
    () =>
      buildPublicationWorkbenchPreview({
        isPreviewEnabled,
        hasPublicationSources,
        buildTable: builders.buildCustomPublicationTable,
      }),
    [builders, hasPublicationSources, isPreviewEnabled],
  )

  const configSignature = useMemo(() => createPublicationConfigSignature(config), [config])
  const templateSignatures = useMemo(() => createPublicationTemplateSignatures(templates), [templates])
  const matchedTemplate = useMemo(
    () => findMatchingPublicationTemplate(templates, templateSignatures, configSignature),
    [configSignature, templateSignatures, templates],
  )
  const templateStatus = useMemo(
    () =>
      getPublicationTemplateStatus({
        matchedTemplate,
        isDefaultTableMode,
        defaultTemplateId: cleanDefaultTemplateId,
      }),
    [cleanDefaultTemplateId, isDefaultTableMode, matchedTemplate],
  )
  const displayTitle = previewTable?.title ?? config.title
  const canExport = useMemo(
    () =>
      canExportPublicationTable({
        isDefaultTableMode,
        result,
        hasActiveModel,
        selectedSources,
      }),
    [hasActiveModel, isDefaultTableMode, result, selectedSources],
  )
  const visibleVariableCount = useMemo(
    () => orderedVariableOptions.filter((option) => !hiddenVariableIds.has(option.id)).length,
    [hiddenVariableIds, orderedVariableOptions],
  )
  const enabledStatisticCount = useMemo(
    () => statisticOptions.filter((option) => !disabledStatisticIds.has(option.id)).length,
    [disabledStatisticIds, statisticOptions],
  )

  const actions = useMemo(
    () =>
      createPublicationWorkbenchActions({
        config,
        templates,
        defaultTemplateId: cleanDefaultTemplateId,
        defaultSourceIds,
        effectiveSourceIds,
        selectedSources,
        variableOptions,
        orderedVariableOptions,
        statisticOptions,
        draggingItem,
        setConfig,
        setTemplates,
        setDefaultTemplateId,
        setDraggingItem,
        createId,
        getNow,
      }),
    [
      config,
      createId,
      cleanDefaultTemplateId,
      defaultSourceIds,
      draggingItem,
      effectiveSourceIds,
      getNow,
      orderedVariableOptions,
      selectedSources,
      statisticOptions,
      templates,
      variableOptions,
    ],
  )

  return {
    state: {
      config,
      templates,
      defaultTemplateId: cleanDefaultTemplateId,
      draggingItem,
      sources,
      selectedSources,
      selectedSourceIds,
      defaultSourceIds,
      effectiveSourceIds,
      variableOptions: orderedVariableOptions,
      statisticOptions,
      hiddenVariableIds,
      disabledStatisticIds,
      options: {
        variables: orderedVariableOptions,
        statistics: statisticOptions,
      },
      sets: {
        selectedSourceIds,
        hiddenVariableIds,
        disabledStatisticIds,
      },
      previewTable,
      previewHtml,
      displayTitle,
      templateStatus,
      isDefaultTableMode,
      hasPublicationSources,
      canExport,
      visibleVariableCount,
      enabledStatisticCount,
    },
    actions,
    builders,
  }
}
