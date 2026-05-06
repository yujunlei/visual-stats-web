import { prepareModelData, type DataPrepConfig, type RunLogEntry } from '../data/preprocess'
import type { Row } from '../data/types'
import type { InferenceConfig, ModelConfig, ModelResult } from '../models/types'
import { getModelPlugin } from '../models/registry'
import type { profileRows } from '../data/tableUtils'

type ModelProfile = ReturnType<typeof profileRows>[number]

type WorkerRequest = {
  taskId: string
  modelId: string
  rows: Row[]
  profiles: ModelProfile[]
  config: ModelConfig
  prepConfig: DataPrepConfig
  inference?: InferenceConfig
}

type WorkerProgressMessage = {
  type: 'progress'
  taskId: string
  status: 'preparing' | 'estimating' | 'finalizing'
  phase: string
  progress: number
}

type WorkerSuccessMessage = {
  type: 'success'
  taskId: string
  result: ModelResult
  logs: RunLogEntry[]
}

type WorkerErrorMessage = {
  type: 'error'
  taskId: string
  error: string
}

const postProgress = (taskId: string, status: WorkerProgressMessage['status'], phase: string, progress: number) => {
  self.postMessage({ type: 'progress', taskId, status, phase, progress } satisfies WorkerProgressMessage)
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { taskId, modelId, rows, profiles, config, prepConfig, inference } = event.data

  try {
    const model = getModelPlugin(modelId)
    postProgress(taskId, 'preparing', '准备数据与字段编码。', 24)

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

    postProgress(taskId, 'estimating', '估计模型，请稍候。', 48)
    const result = model.fit({
      rows: preparedData.rows,
      config: preparedData.config,
      inference: model.supportsInference ? inference : undefined,
    })

    postProgress(taskId, 'finalizing', '生成结果表与重点解读。', 94)
    self.postMessage({ type: 'success', taskId, result, logs: preparedData.logs } satisfies WorkerSuccessMessage)
  } catch (error) {
    self.postMessage({
      type: 'error',
      taskId,
      error: error instanceof Error ? error.message : '模型运行失败。',
    } satisfies WorkerErrorMessage)
  }
}
