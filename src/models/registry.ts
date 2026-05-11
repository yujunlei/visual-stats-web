import { commonMethodPlugins } from './plugins/commonMethods'
import { correlationAnalysisPlugin } from './plugins/correlationAnalysis'
import { descriptiveStatsPlugin } from './plugins/descriptiveStats'
import { linearRegressionPlugin } from './plugins/linearRegression'
import { logitRegressionPlugin } from './plugins/logitRegression'
import { mediationAnalysisPlugin } from './plugins/mediationAnalysis'
import { moderatedMediationPlugin } from './plugins/moderatedMediation'
import { moderationAnalysisPlugin } from './plugins/moderationAnalysis'
import { ordinaryRegressionPlugin } from './plugins/ordinaryRegression'
import { reghdfeRegressionPlugin } from './plugins/reghdfeRegression'
import { spatialModelPlugins } from './plugins/spatialRegression'
import { thresholdRegressionPlugin } from './plugins/thresholdRegression'
import { xtregFixedEffectsPlugin } from './plugins/xtregFixedEffects'
import { modelCatalog, modelCatalogById, modelPacks, modelTaskGroupOrder } from './catalog'
import type { ModelCatalogEntry, ModelPlugin } from './types'

export { modelCatalog, modelPacks, modelTaskGroupOrder }

export const allModelPlugins = [
  ...commonMethodPlugins,
  linearRegressionPlugin,
  ordinaryRegressionPlugin,
  xtregFixedEffectsPlugin,
  reghdfeRegressionPlugin,
  mediationAnalysisPlugin,
  moderationAnalysisPlugin,
  ...spatialModelPlugins,
  thresholdRegressionPlugin,
  moderatedMediationPlugin,
  logitRegressionPlugin,
  descriptiveStatsPlugin,
  correlationAnalysisPlugin,
] satisfies ModelPlugin[]

export const modelPlugins = allModelPlugins.filter((plugin) => modelCatalogById.get(plugin.id)?.enabledByDefault ?? true)

export const getModelPlugin = (id: string) => {
  const plugin = allModelPlugins.find((entry) => entry.id === id)
  if (!plugin) throw new Error(`Unknown model plugin id: ${id}`)
  return plugin
}

export const getModelCatalogEntry = (id: string): ModelCatalogEntry | undefined => modelCatalogById.get(id)

export const getModelTaskGroup = (plugin: ModelPlugin) => getModelCatalogEntry(plugin.id)?.taskGroup ?? plugin.category

export const getModelUseCase = (plugin: ModelPlugin) => getModelCatalogEntry(plugin.id)?.useCase ?? plugin.description

export const getModelAccuracyNotes = (plugin: ModelPlugin) => getModelCatalogEntry(plugin.id)?.accuracyNotes ?? plugin.maturity?.description ?? '当前模型暂无额外准确性说明。'

export const getModelMaturity = (plugin: ModelPlugin) => {
  const entry = getModelCatalogEntry(plugin.id)
  if (entry) {
    if (entry.maturityLevel === 'stable') {
      return { level: 'stable' as const, label: '稳定', description: entry.accuracyNotes }
    }
    if (entry.maturityLevel === 'preview') {
      return { level: 'preview' as const, label: '预览', description: entry.accuracyNotes }
    }
    return { level: 'experimental' as const, label: '实验', description: entry.accuracyNotes }
  }

  return {
    level: plugin.maturity?.level === 'prototype' ? ('experimental' as const) : (plugin.maturity?.level ?? 'stable'),
    label: plugin.maturity?.label ?? '稳定',
    description: plugin.maturity?.description ?? '当前模型暂无额外准确性说明。',
  }
}

const duplicateModelIds = allModelPlugins
  .map((plugin) => plugin.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index)

if (duplicateModelIds.length > 0) {
  throw new Error(`Duplicate model plugin id(s): ${Array.from(new Set(duplicateModelIds)).join(', ')}`)
}

const missingCatalogIds = allModelPlugins.map((plugin) => plugin.id).filter((id) => !modelCatalogById.has(id))
if (missingCatalogIds.length > 0) {
  throw new Error(`Missing model catalog metadata for: ${missingCatalogIds.join(', ')}`)
}

const unknownCatalogIds = modelCatalog.map((entry) => entry.id).filter((id) => !allModelPlugins.some((plugin) => plugin.id === id))
if (unknownCatalogIds.length > 0) {
  throw new Error(`Model catalog references unknown plugin id(s): ${unknownCatalogIds.join(', ')}`)
}
