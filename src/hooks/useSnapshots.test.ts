import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchSnapshot } from './useSnapshots'
import type { ModelPlugin } from '../models/types'

const model = {
  id: 'linear-regression',
  name: '线性回归',
  shortName: 'OLS',
  getFormula: () => 'y ~ x',
} as unknown as ModelPlugin

describe('useSnapshots helpers', () => {
  it('creates a snapshot from the current workbench state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000000000)

    const snapshot = createWorkbenchSnapshot(
      {
        activeModel: model,
        fileName: 'demo.xlsx',
        rows: [{ y: 1, x: 2 }],
        fieldCount: 2,
        dataRoles: { idFields: ['id'], timeField: 'year', groupFields: [] },
        typeOverrides: {},
        prepConfig: { missingStrategy: 'drop', categoricalEncoding: 'one-hot' },
        inferenceConfig: { standardError: 'ols', clusterField: '' },
        modelConfig: { target: 'y', features: ['x'], params: {} },
        result: null,
        resultLogs: [],
      },
      '2026-05-11T00:00:00.000Z',
    )

    expect(snapshot).toMatchObject({
      id: '1710000000000',
      label: '线性回归 · demo.xlsx',
      modelId: 'linear-regression',
      modelShortName: 'OLS',
      formula: 'y ~ x',
      rowCount: 1,
      fieldCount: 2,
      favorite: false,
      pinned: false,
      tags: [],
      note: '',
      runSummary: null,
    })
    expect(snapshot.result).toBeUndefined()
    expect(snapshot.savedResultAt).toBeUndefined()
  })
})
