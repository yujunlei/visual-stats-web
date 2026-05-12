import type { RunModelFailure, RunModelProgress, RunModelRequest, RunModelSuccess } from './modelRunnerTypes'
import { runModelTask } from './runModelTask'

const postProgress = (taskId: string, status: RunModelProgress['status'], phase: string, progress: number) => {
  self.postMessage({ type: 'progress', taskId, status, phase, progress } satisfies RunModelProgress)
}

self.onmessage = (event: MessageEvent<RunModelRequest>) => {
  const { taskId } = event.data

  try {
    const { result, logs } = runModelTask(event.data, (status, phase, progress) => postProgress(taskId, status, phase, progress))
    self.postMessage({ type: 'success', taskId, result, logs } satisfies RunModelSuccess)
  } catch (error) {
    self.postMessage({
      type: 'error',
      taskId,
      error: error instanceof Error ? error.message : '模型运行失败。',
    } satisfies RunModelFailure)
  }
}
