import type { CustomPublicationConfig } from './customPublicationConfig'
import type { CustomPublicationOption, CustomPublicationStatisticOption } from './customPublicationOptions'
import { buildCustomPublicationTable, type CustomPublicationSource, type PublicationTable } from './publicationTables'

type BuildCustomPublicationTableFromConfigInput = {
  config: CustomPublicationConfig
  isDefaultTableMode: boolean
  baselineTable: PublicationTable | null
  selectedSources: CustomPublicationSource[]
  orderedVariableOptions: CustomPublicationOption[]
  statisticOptions: CustomPublicationStatisticOption[]
  hiddenVariableIds: Set<string>
  disabledStatisticIds: Set<string>
}

export function buildCustomPublicationTableFromConfig({
  config,
  isDefaultTableMode,
  baselineTable,
  selectedSources,
  orderedVariableOptions,
  statisticOptions,
  hiddenVariableIds,
  disabledStatisticIds,
}: BuildCustomPublicationTableFromConfigInput) {
  if (isDefaultTableMode) return baselineTable

  const sources: CustomPublicationSource[] = selectedSources.map((source, index) => {
    const draft = config.columns[source.id]
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
    title: config.title,
    note: config.note,
    sources,
    variableOrder: orderedVariableOptions.filter((option) => !hiddenVariableIds.has(option.id)).map((option) => option.id),
    enabledStatisticIds: statisticOptions.filter((option) => !disabledStatisticIds.has(option.id)).map((option) => option.id),
    variableLabels: config.variableLabels,
    statisticLabels: config.statisticLabels,
    formatRules: config.formatRules,
  })
}
