import { describe, expect, it } from 'vitest'
import { mergeSnapshotRecord, toSnapshotMeta, toSnapshotPayload } from './snapshotStore'
import type { WorkbenchSnapshot } from './snapshots'

const snapshot: WorkbenchSnapshot = {
  id: 's1',
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:00.000Z',
  label: '线性回归 · demo.xlsx',
  fileName: 'demo.xlsx',
  rowCount: 1,
  fieldCount: 2,
  modelId: 'linear-regression',
  modelName: '线性回归',
  modelShortName: 'OLS',
  formula: 'y ~ x',
  saveMode: 'full',
  hasRows: true,
  rows: [{ y: 1, x: 2 }],
  dataRoles: { idFields: ['id'], timeField: 'year', groupFields: [] },
  typeOverrides: {},
  prepConfig: { missingStrategy: 'drop', categoricalEncoding: 'one-hot' },
  inferenceConfig: { standardError: 'ols', clusterField: '' },
  modelConfig: { target: 'y', features: ['x'], params: {} },
  note: '',
  tags: [],
  favorite: false,
  pinned: false,
  runSummary: null,
}

describe('snapshotStore', () => {
  it('splits snapshot metadata from heavy payload and can merge it back', () => {
    const meta = toSnapshotMeta(snapshot)
    const payload = toSnapshotPayload(snapshot)

    expect(meta).not.toHaveProperty('rows')
    expect(payload).toMatchObject({ id: 's1', rows: [{ y: 1, x: 2 }] })
    expect(mergeSnapshotRecord(meta, payload)).toEqual(snapshot)
  })
})
