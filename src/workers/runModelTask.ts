import { prepareModelData, type RunLogEntry } from '../data/preprocess'
import { getModelPlugin } from '../models/registry'
import type { ModelResult } from '../models/types'
import type { RunModelProgress, RunModelRequest } from './modelRunnerTypes'

type RunModelProgressHandler = (status: RunModelProgress['status'], phase: string, progress: number) => void

export type RunModelTaskResult = {
  result: ModelResult
  logs: RunLogEntry[]
}

export function runModelTask(request: RunModelRequest, onProgress: RunModelProgressHandler): RunModelTaskResult {
  const { modelId, rows, profiles, config, prepConfig, inference } = request
  const model = getModelPlugin(modelId)

  onProgress('preparing', '准备数据与字段编码。', 24)

  const preparedData =
    !model.requiresTarget || model.usesRawRows
      ? {
          rows,
          config,
          logs: [{ level: 'info', message: '当前插件使用原始数据表，并在插件内部处理缺失值或固定效应吸收。' }] satisfies RunLogEntry[],
        }
      : prepareModelData(
          rows,
          profiles,
          config,
          prepConfig,
          model.supportsCategoricalFeatures,
          model.supportsInference && inference?.standardError === 'cluster' && inference.clusterField ? [inference.clusterField] : [],
        )

  onProgress('estimating', '估计模型，请稍候。', 48)

  const result = model.fit({
    rows: preparedData.rows,
    config: preparedData.config,
    inference: model.supportsInference ? inference : undefined,
  })

  onProgress('finalizing', '生成结果表与重点解读。', 94)

  return { result, logs: preparedData.logs }
}
