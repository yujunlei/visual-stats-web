import type { CustomPublicationSource } from './publicationTables'

export type CustomPublicationOption = {
  id: string
  label: string
}

export type CustomPublicationStatisticOption = CustomPublicationOption & {
  detail: string
}

export function resolveSelectedPublicationSources(
  publicationSources: CustomPublicationSource[],
  selectedSourceIds: Set<string>,
  columnOrder: string[],
) {
  const selected = publicationSources.filter((source) => selectedSourceIds.has(source.id))
  const byId = new Map(selected.map((source) => [source.id, source]))
  const ordered: CustomPublicationSource[] = []

  columnOrder.forEach((id) => {
    const source = byId.get(id)
    if (source) {
      ordered.push(source)
      byId.delete(id)
    }
  })
  byId.forEach((source) => ordered.push(source))

  return ordered
}

export function getCustomPublicationVariableOptions(
  selectedPublicationSources: CustomPublicationSource[],
  variableLabels: Record<string, string>,
) {
  const byId = new Map<string, CustomPublicationOption>()
  selectedPublicationSources.forEach((source) => {
    const coefficientTable = source.result.tables.find((table) => table.id === 'coefficients')
    coefficientTable?.rows.forEach((row) => {
      const rawId = String(row.term ?? row.variable ?? '').trim()
      if (!rawId) return

      const label = variableLabels[rawId]?.trim() || (rawId === '_cons' ? 'Cons' : rawId)
      if (!byId.has(rawId)) byId.set(rawId, { id: rawId, label })
    })
  })

  return Array.from(byId.values())
}

export function orderCustomPublicationOptions<TOption extends CustomPublicationOption>(options: TOption[], order: string[]) {
  const optionMap = new Map(options.map((option) => [option.id, option]))
  const ordered: TOption[] = []

  order.forEach((id) => {
    const option = optionMap.get(id)
    if (option) {
      ordered.push(option)
      optionMap.delete(id)
    }
  })
  optionMap.forEach((option) => ordered.push(option))

  return ordered
}

export function getCustomPublicationStatisticOptions(
  selectedPublicationSources: CustomPublicationSource[],
  statisticLabels: Record<string, string>,
  statisticOrder: string[],
) {
  const rows: CustomPublicationStatisticOption[] = []
  if (selectedPublicationSources.length === 0) return rows

  rows.push({
    id: 'controls',
    label: statisticLabels.controls?.trim() || 'Controls',
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
      label: statisticLabels[`fe:${label}`]?.trim() || label,
      detail: '固定效应统计行',
    })
  })

  rows.push(
    { id: 'n', label: statisticLabels.n?.trim() || 'N', detail: '样本量统计行' },
    { id: 'adj-r2', label: statisticLabels['adj-r2']?.trim() || 'Adj-R²', detail: '调整 R² 统计行' },
  )

  return orderCustomPublicationOptions(rows, statisticOrder)
}
