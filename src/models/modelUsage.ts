import type { ModelPlugin } from './types'

export type ModelUsageMap = Record<string, { usedCount: number; lastUsedAt: string }>

type FilterModelPluginsInput = {
  plugins: ModelPlugin[]
  query: string
  selectedCategory: string
  allCategory: string
  activeModelId: string | null
  modelUsage: ModelUsageMap
  modelOrder: Map<string, number>
  getTaskGroup: (plugin: ModelPlugin) => string
}

export function filterAndSortModelPlugins({
  plugins,
  query,
  selectedCategory,
  allCategory,
  activeModelId,
  modelUsage,
  modelOrder,
  getTaskGroup,
}: FilterModelPluginsInput) {
  const normalizedQuery = query.trim().toLowerCase()
  const categoryFiltered =
    selectedCategory === allCategory ? plugins : plugins.filter((plugin) => getTaskGroup(plugin) === selectedCategory)
  const matched = normalizedQuery
    ? categoryFiltered.filter((plugin) =>
        [plugin.name, plugin.shortName, plugin.fullName, getTaskGroup(plugin), plugin.description, ...plugin.keywords]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery),
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
}

export function getRecentModelPlugins(plugins: ModelPlugin[], modelUsage: ModelUsageMap, activeModelId: string | null, limit = 5) {
  return plugins
    .filter((plugin) => plugin.id !== activeModelId && modelUsage[plugin.id]?.lastUsedAt)
    .sort((left, right) => new Date(modelUsage[right.id]?.lastUsedAt ?? 0).getTime() - new Date(modelUsage[left.id]?.lastUsedAt ?? 0).getTime())
    .slice(0, limit)
}

export function recordModelUsage(modelUsage: ModelUsageMap, modelId: string, usedAt = new Date().toISOString()): ModelUsageMap {
  const previous = modelUsage[modelId]
  return {
    ...modelUsage,
    [modelId]: {
      usedCount: (previous?.usedCount ?? 0) + 1,
      lastUsedAt: usedAt,
    },
  }
}
