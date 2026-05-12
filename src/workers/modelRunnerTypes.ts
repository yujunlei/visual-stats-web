import type { DataPrepConfig, RunLogEntry } from '../data/preprocess'
import type { Row } from '../data/types'
import type { InferenceConfig, ModelConfig, ModelResult } from '../models/types'
import type { profileRows } from '../data/tableUtils'

export type ModelProfile = ReturnType<typeof profileRows>[number]

export type RunModelRequest = {
  taskId: string
  modelId: string
  rows: Row[]
  profiles: ModelProfile[]
  config: ModelConfig
  prepConfig: DataPrepConfig
  inference?: InferenceConfig
}

export type RunModelProgress = {
  type: 'progress'
  taskId: string
  status: 'preparing' | 'estimating' | 'finalizing'
  phase: string
  progress: number
}

export type RunModelSuccess = {
  type: 'success'
  taskId: string
  result: ModelResult
  logs: RunLogEntry[]
}

export type RunModelFailure = {
  type: 'error'
  taskId: string
  error: string
}

export type RunModelMessage = RunModelProgress | RunModelSuccess | RunModelFailure
