import { useEffect, useRef, useState } from 'react'
import type { DataPrepConfig, RunLogEntry } from '../data/preprocess'
import type { Row } from '../data/types'
import type { ModelProfile, RunModelMessage, RunModelRequest } from '../workers/modelRunnerTypes'
import { estimateRunDuration, isSlowModel, type RunTask, type RunTaskStatus } from '../workers/runProgress'
import type { InferenceConfig, ModelConfig, ModelPlugin, ModelResult } from '../models/types'

export type WorkflowStep = 'model' | 'upload' | 'roles' | 'variables' | 'run' | 'results'

export type RunState = {
  result: ModelResult | null
  error: string
  logs: RunLogEntry[]
  signature: string
}

export type RunFailureDialog = {
  message: string
  modelName: string
  formula: string
}

export type RunValidationIssue = {
  message: string
}

export type ModelMaturityNotice = {
  level: string
  label: string
  description: string
}

export const createRunSignature = (payload: unknown) => JSON.stringify(payload)

export const createInitialRunState = (): RunState => ({
  result: null,
  error: '',
  logs: [{ level: 'info', message: '导入数据并点击运行模型后，这里会显示结果。' }],
  signature: '',
})

export function buildCompletedRunLogs(
  baseLogs: RunLogEntry[],
  result: ModelResult,
  modelName: string,
  modelMaturity: ModelMaturityNotice,
  limitations?: string[],
) {
  return [
    ...baseLogs,
    ...(modelMaturity.level === 'stable'
      ? []
      : [{ level: 'warning', message: `${modelName}当前为${modelMaturity.label}能力：${modelMaturity.description}` } satisfies RunLogEntry]),
    ...(limitations?.map((message) => ({ level: 'warning' as const, message })) ?? []),
    ...(result.warnings?.map((message) => ({ level: 'warning' as const, message })) ?? []),
    { level: 'info', message: `${modelName}运行完成。` } satisfies RunLogEntry,
  ] satisfies RunLogEntry[]
}

type UseModelRunOptions = {
  hasDataset: boolean
  hasActiveModel: boolean
  activeModel: ModelPlugin
  rows: Row[]
  profiles: ModelProfile[]
  sanitizedConfig: ModelConfig
  prepConfig: DataPrepConfig
  effectiveInference: InferenceConfig
  currentRunSignature: string
  modelMaturity: ModelMaturityNotice
  setWorkflowStep: (step: WorkflowStep) => void
  setIsVariableSetupOpen: (isOpen: boolean) => void
  setUploadError: (message: string) => void
}

type ResetRunOptions = {
  clearTask?: boolean
  clearFailureDialog?: boolean
}

export function useModelRun({
  hasDataset,
  hasActiveModel,
  activeModel,
  rows,
  profiles,
  sanitizedConfig,
  prepConfig,
  effectiveInference,
  currentRunSignature,
  modelMaturity,
  setWorkflowStep,
  setIsVariableSetupOpen,
  setUploadError,
}: UseModelRunOptions) {
  const [runState, setRunState] = useState<RunState>(createInitialRunState)
  const [isModelRunning, setIsModelRunning] = useState(false)
  const [runStatus, setRunStatus] = useState('')
  const [runTask, setRunTask] = useState<RunTask | null>(null)
  const [runFailureDialog, setRunFailureDialog] = useState<RunFailureDialog | null>(null)
  const runCancelRef = useRef(false)
  const runWorkerRef = useRef<Worker | null>(null)

  useEffect(() => {
    if (!isModelRunning) return undefined

    const intervalId = window.setInterval(() => {
      setRunTask((current) => {
        if (!current || current.status === 'cancelled') return current
        const elapsedMs = Date.now() - current.startedAt
        const estimatedProgress = Math.min(92, Math.round((elapsedMs / current.estimatedMs) * 86) + 6)
        return {
          ...current,
          elapsedMs,
          progress: Math.max(current.progress, estimatedProgress),
        }
      })
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [isModelRunning])

  useEffect(
    () => () => {
      runCancelRef.current = true
      runWorkerRef.current?.terminate()
    },
    [],
  )

  const replaceRunState = (nextRunState: RunState, options: ResetRunOptions = {}) => {
    setRunState(nextRunState)
    if (options.clearTask ?? true) setRunTask(null)
    if (options.clearFailureDialog ?? true) setRunFailureDialog(null)
    setRunStatus('')
  }

  const updateRunTask = (status: RunTaskStatus, phase: string, progress: number) => {
    setRunStatus(phase)
    setRunTask((current) =>
      current
        ? {
            ...current,
            status,
            phase,
            progress: Math.max(current.progress, progress),
            elapsedMs: Date.now() - current.startedAt,
          }
        : current,
    )
  }

  const cancelRunTask = () => {
    if (!isModelRunning) return
    runCancelRef.current = true
    runWorkerRef.current?.terminate()
    runWorkerRef.current = null
    setIsModelRunning(false)
    setRunStatus('')
    setRunTask((current) =>
      current
        ? {
            ...current,
            status: 'cancelled',
            phase: '任务已取消，参数面板已解锁。',
            elapsedMs: Date.now() - current.startedAt,
          }
        : current,
    )
    setRunState({
      result: null,
      error: '',
      logs: [{ level: 'warning', message: '用户已取消本次模型运行。' }],
      signature: currentRunSignature,
    })
    setRunFailureDialog(null)
    setWorkflowStep('variables')
  }

  const handleRunModel = (validationErrors: RunValidationIssue[] = []) => {
    if (!hasDataset || !hasActiveModel || isModelRunning) return
    if (validationErrors.length > 0) {
      setWorkflowStep('variables')
      setIsVariableSetupOpen(true)
      setRunState({
        result: null,
        error: `请先选择变量后再运行：${validationErrors[0]?.message ?? '变量设定未完成。'}`,
        logs: validationErrors.map((issue) => ({ level: 'warning' as const, message: issue.message })),
        signature: currentRunSignature,
      })
      return
    }

    setUploadError('')
    setRunFailureDialog(null)
    runWorkerRef.current?.terminate()
    runCancelRef.current = false
    const taskId = `${Date.now()}-${activeModel.id}`
    const estimatedMs = estimateRunDuration(activeModel.id, rows.length)
    setIsModelRunning(true)
    setWorkflowStep('run')
    setRunStatus('创建运行任务。')
    setRunTask({
      id: taskId,
      modelName: activeModel.name,
      status: 'preparing',
      phase: '创建运行任务。',
      progress: 6,
      startedAt: Date.now(),
      elapsedMs: 0,
      estimatedMs,
    })

    const completeRun = (result: ModelResult, logs: RunLogEntry[]) => {
      if (runCancelRef.current) return
      setRunState({
        result,
        error: '',
        logs: buildCompletedRunLogs(logs, result, activeModel.name, modelMaturity, activeModel.limitations),
        signature: currentRunSignature,
      })
      setRunTask((current) =>
        current
          ? {
              ...current,
              status: 'completed',
              phase: '运行完成。',
              progress: 100,
              elapsedMs: Date.now() - current.startedAt,
            }
          : current,
      )
      setIsModelRunning(false)
      setRunStatus('')
      runWorkerRef.current = null
      setRunFailureDialog(null)
      setWorkflowStep('results')
    }

    const failRun = (message: string) => {
      if (runCancelRef.current) return
      setRunState({
        result: null,
        error: message,
        logs: [{ level: 'warning', message }],
        signature: currentRunSignature,
      })
      setRunTask((current) =>
        current
          ? {
              ...current,
              status: 'failed',
              phase: message,
              progress: current.progress,
              elapsedMs: Date.now() - current.startedAt,
            }
          : current,
      )
      setIsModelRunning(false)
      setRunStatus('')
      runWorkerRef.current = null
      setRunFailureDialog({
        message,
        modelName: activeModel.name,
        formula: activeModel.getFormula(sanitizedConfig),
      })
      setWorkflowStep('variables')
    }

    const startBrowserWorker = (prefixLogs: RunLogEntry[] = []) => {
      const worker = new Worker(new URL('../workers/modelRunner.ts', import.meta.url), { type: 'module' })
      runWorkerRef.current = worker
      worker.onmessage = (event: MessageEvent<RunModelMessage>) => {
        const message = event.data
        if (message.taskId !== taskId || runCancelRef.current) return

        if (message.type === 'progress') {
          updateRunTask(
            message.status,
            isSlowModel(activeModel.id) && message.status === 'estimating' ? '估计模型中，慢模型可能需要更长时间。' : message.phase,
            message.progress,
          )
          return
        }

        if (message.type === 'success') {
          completeRun(message.result, [...prefixLogs, ...message.logs])
          worker.terminate()
          return
        }

        failRun(message.error)
        worker.terminate()
      }

      worker.onerror = () => {
        failRun('模型运行进程异常退出。')
        worker.terminate()
      }

      worker.postMessage({
        taskId,
        modelId: activeModel.id,
        rows,
        profiles,
        config: sanitizedConfig,
        prepConfig,
        inference: activeModel.supportsInference ? effectiveInference : undefined,
      } satisfies RunModelRequest)
    }

    startBrowserWorker()
  }

  return {
    runState,
    runStatus,
    runTask,
    runFailureDialog,
    isModelRunning,
    cancelRunTask,
    closeRunFailureDialog: () => setRunFailureDialog(null),
    handleRunModel,
    replaceRunState,
  }
}
