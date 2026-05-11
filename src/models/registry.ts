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

export const modelPlugins = [
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
]

export const getModelPlugin = (id: string) => {
  const plugin = modelPlugins.find((entry) => entry.id === id)
  if (!plugin) throw new Error(`Unknown model plugin id: ${id}`)
  return plugin
}

const duplicateModelIds = modelPlugins
  .map((plugin) => plugin.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index)

if (duplicateModelIds.length > 0) {
  throw new Error(`Duplicate model plugin id(s): ${Array.from(new Set(duplicateModelIds)).join(', ')}`)
}
