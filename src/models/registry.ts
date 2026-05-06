import { berTopicPlugin } from './plugins/berTopic'
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
  berTopicPlugin,
]

export const getModelPlugin = (id: string) => modelPlugins.find((plugin) => plugin.id === id) ?? modelPlugins[0]
