import {
  buildCustomPublicationNote,
  normalizeCustomPublicationConfig,
  type CustomPublicationColumnDraft,
  type CustomPublicationConfig,
  type CustomPublicationFormatRules,
  type CustomPublicationTemplate,
} from './customPublicationConfig'

export type CustomPublicationDragItem = {
  kind: 'column' | 'variable' | 'statistic'
  id: string
}

export type CustomPublicationDirection = 'up' | 'down'

type ReorderAvailableIds = {
  column: string[]
  variable: string[]
  statistic: string[]
}

export const moveOrderedItem = (items: string[], id: string, toIndex: number) => {
  const index = items.indexOf(id)
  if (index === -1 || toIndex < 0 || toIndex >= items.length || index === toIndex) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(toIndex, 0, item)
  return next
}

const orderedIdsFor = (order: string[], availableIds: string[]) => [
  ...order.filter((id) => availableIds.includes(id)),
  ...availableIds.filter((id) => !order.includes(id)),
]

const nextIndexForDirection = (index: number, direction: CustomPublicationDirection) => (direction === 'up' ? index - 1 : index + 1)

export const customPublicationAsCustom = (current: CustomPublicationConfig, defaultSourceIds: string[]): CustomPublicationConfig => ({
  ...current,
  mode: 'custom',
  selectedSourceIds: current.selectedSourceIds.length > 0 ? current.selectedSourceIds : defaultSourceIds,
})

export const updateCustomPublicationText = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  patch: Partial<Pick<CustomPublicationConfig, 'title' | 'note'>>,
) => ({
  ...customPublicationAsCustom(current, defaultSourceIds),
  ...patch,
})

export const updateCustomPublicationFormatRules = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  patch: Partial<CustomPublicationFormatRules>,
) => {
  const customCurrent = customPublicationAsCustom(current, defaultSourceIds)
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
}

export const toggleCustomPublicationSource = (
  current: CustomPublicationConfig,
  sourceId: string,
  defaultSourceIds: string[],
  effectiveSourceIds: string[],
) => {
  const customCurrent = customPublicationAsCustom(current, defaultSourceIds)
  const baseSelected = customCurrent.selectedSourceIds.length > 0 ? customCurrent.selectedSourceIds : effectiveSourceIds
  const selected = baseSelected.includes(sourceId)
    ? baseSelected.filter((id) => id !== sourceId)
    : [...baseSelected, sourceId]

  return { ...customCurrent, selectedSourceIds: selected }
}

export const updateCustomPublicationColumn = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  sourceId: string,
  patch: Partial<Omit<CustomPublicationColumnDraft, 'id'>>,
) => {
  const customCurrent = customPublicationAsCustom(current, defaultSourceIds)

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
}

export const moveCustomPublicationColumn = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  sourceId: string,
  direction: CustomPublicationDirection,
  availableIds: string[],
) => {
  const customCurrent = customPublicationAsCustom(current, defaultSourceIds)
  const orderedIds = orderedIdsFor(customCurrent.columnOrder, availableIds)
  const index = orderedIds.indexOf(sourceId)
  if (index === -1) return customCurrent
  const nextIndex = nextIndexForDirection(index, direction)
  if (nextIndex < 0 || nextIndex >= orderedIds.length) return customCurrent
  return { ...customCurrent, columnOrder: moveOrderedItem(orderedIds, sourceId, nextIndex) }
}

export const updateCustomPublicationVariableLabel = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  variableId: string,
  label: string,
) => ({
  ...customPublicationAsCustom(current, defaultSourceIds),
  variableLabels: {
    ...current.variableLabels,
    [variableId]: label,
  },
})

export const toggleCustomPublicationVariable = (current: CustomPublicationConfig, defaultSourceIds: string[], variableId: string) => {
  const customCurrent = customPublicationAsCustom(current, defaultSourceIds)
  const hiddenVariableIds = customCurrent.hiddenVariableIds.includes(variableId)
    ? customCurrent.hiddenVariableIds.filter((id) => id !== variableId)
    : [...customCurrent.hiddenVariableIds, variableId]
  return { ...customCurrent, hiddenVariableIds }
}

export const moveCustomPublicationVariable = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  variableId: string,
  direction: CustomPublicationDirection,
  availableIds: string[],
) => {
  const customCurrent = customPublicationAsCustom(current, defaultSourceIds)
  const orderedIds = orderedIdsFor(customCurrent.variableOrder, availableIds)
  const index = orderedIds.indexOf(variableId)
  if (index === -1) return customCurrent
  const nextIndex = nextIndexForDirection(index, direction)
  if (nextIndex < 0 || nextIndex >= orderedIds.length) return customCurrent
  return { ...customCurrent, variableOrder: moveOrderedItem(orderedIds, variableId, nextIndex) }
}

export const updateCustomPublicationStatisticLabel = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  statisticId: string,
  label: string,
) => ({
  ...customPublicationAsCustom(current, defaultSourceIds),
  statisticLabels: {
    ...current.statisticLabels,
    [statisticId]: label,
  },
})

export const toggleCustomPublicationStatistic = (current: CustomPublicationConfig, defaultSourceIds: string[], statisticId: string) => {
  const customCurrent = customPublicationAsCustom(current, defaultSourceIds)
  const disabledStatisticIds = customCurrent.disabledStatisticIds.includes(statisticId)
    ? customCurrent.disabledStatisticIds.filter((id) => id !== statisticId)
    : [...customCurrent.disabledStatisticIds, statisticId]
  return { ...customCurrent, disabledStatisticIds }
}

export const moveCustomPublicationStatistic = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  statisticId: string,
  direction: CustomPublicationDirection,
  availableIds: string[],
) => {
  const customCurrent = customPublicationAsCustom(current, defaultSourceIds)
  const orderedIds = orderedIdsFor(customCurrent.statisticOrder, availableIds)
  const index = orderedIds.indexOf(statisticId)
  if (index === -1) return customCurrent
  const nextIndex = nextIndexForDirection(index, direction)
  if (nextIndex < 0 || nextIndex >= orderedIds.length) return customCurrent
  return { ...customCurrent, statisticOrder: moveOrderedItem(orderedIds, statisticId, nextIndex) }
}

export const resetCustomPublicationOrdering = (current: CustomPublicationConfig, defaultSourceIds: string[]) => ({
  ...customPublicationAsCustom(current, defaultSourceIds),
  columnOrder: [],
  variableOrder: [],
  statisticOrder: [],
})

export const setAllCustomPublicationVariables = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  visible: boolean,
  variableIds: string[],
) => ({
  ...customPublicationAsCustom(current, defaultSourceIds),
  hiddenVariableIds: visible ? [] : variableIds,
})

export const setAllCustomPublicationStatistics = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  enabled: boolean,
  statisticIds: string[],
) => ({
  ...customPublicationAsCustom(current, defaultSourceIds),
  disabledStatisticIds: enabled ? [] : statisticIds,
})

export const reorderCustomPublicationByDrop = (
  current: CustomPublicationConfig,
  defaultSourceIds: string[],
  draggingItem: CustomPublicationDragItem | null,
  kind: CustomPublicationDragItem['kind'],
  targetId: string,
  availableIdsByKind: ReorderAvailableIds,
) => {
  if (!draggingItem || draggingItem.kind !== kind || draggingItem.id === targetId) return current

  const customCurrent = customPublicationAsCustom(current, defaultSourceIds)
  const availableIds = availableIdsByKind[kind]
  const orderKey = kind === 'column' ? 'columnOrder' : kind === 'variable' ? 'variableOrder' : 'statisticOrder'
  const orderedIds = orderedIdsFor(customCurrent[orderKey], availableIds)
  const targetIndex = orderedIds.indexOf(targetId)
  if (targetIndex === -1) return customCurrent

  return { ...customCurrent, [orderKey]: moveOrderedItem(orderedIds, draggingItem.id, targetIndex) }
}

export const createCustomPublicationTemplate = (
  config: CustomPublicationConfig,
  defaultSourceIds: string[],
  name: string,
  id: string,
  updatedAt: string,
): CustomPublicationTemplate => ({
  id,
  name,
  updatedAt,
  config: structuredClone({ ...customPublicationAsCustom(config, defaultSourceIds), mode: 'custom' }),
})

export const applyCustomPublicationTemplateConfig = (config: CustomPublicationConfig, defaultSourceIds: string[]) =>
  customPublicationAsCustom({ ...normalizeCustomPublicationConfig(structuredClone(config)), mode: 'custom' }, defaultSourceIds)
