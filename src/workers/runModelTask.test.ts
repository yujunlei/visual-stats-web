import { describe, expect, it } from 'vitest'
import { profileRows } from '../data/tableUtils'
import type { Row } from '../data/types'
import type { RunModelProgress, RunModelRequest } from './modelRunnerTypes'
import { runModelTask } from './runModelTask'

const rows: Row[] = [
  { y: 1, x: 0 },
  { y: 3, x: 1 },
  { y: 5, x: 2 },
  { y: 7, x: 3 },
  { y: 9, x: 4 },
]

const request: RunModelRequest = {
  taskId: 'task-1',
  modelId: 'linear-regression',
  rows,
  profiles: profileRows(rows),
  config: { target: 'y', features: ['x'], params: { target: 'y', features: ['x'], controls: [] } },
  prepConfig: { missingStrategy: 'drop', categoricalEncoding: 'one-hot' },
  inference: { standardError: 'ols', clusterField: '' },
}

describe('runModelTask', () => {
  it('emits progress phases and returns a model result', () => {
    const progress: Array<Pick<RunModelProgress, 'status' | 'phase' | 'progress'>> = []

    const { result, logs } = runModelTask(request, (status, phase, value) => {
      progress.push({ status, phase, progress: value })
    })

    expect(progress.map((entry) => entry.status)).toEqual(['preparing', 'estimating', 'finalizing'])
    expect(progress.map((entry) => entry.progress)).toEqual([24, 48, 94])
    expect(result.id).toBe('linear-regression')
    expect(result.tables.some((table) => table.id === 'coefficients')).toBe(true)
    expect(logs.length).toBeGreaterThan(0)
  })

  it('throws a clear error for an unknown model id', () => {
    expect(() => runModelTask({ ...request, modelId: 'missing-model' }, () => undefined)).toThrow('Unknown model plugin id')
  })
})
