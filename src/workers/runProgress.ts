export type RunTaskStatus = 'preparing' | 'estimating' | 'finalizing' | 'completed' | 'cancelled' | 'failed'

export type RunTask = {
  id: string
  modelName: string
  status: RunTaskStatus
  phase: string
  progress: number
  startedAt: number
  elapsedMs: number
  estimatedMs: number
}

const slowModelIds = new Set(['mediation-analysis', 'moderated-mediation', 'reghdfe-regression', 'xtreg-fixed-effects'])

export const isSlowModel = (modelId: string) => slowModelIds.has(modelId) || modelId.startsWith('spatial-')

export const estimateRunDuration = (modelId: string, rowCount: number) => {
  const rowFactor = Math.min(5000, rowCount) / 5000
  if (isSlowModel(modelId)) return Math.round(4200 + rowFactor * 3600)
  if (rowCount > 5000) return 3000
  return 1800
}

export const formatDuration = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
}
