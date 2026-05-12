import { describe, expect, it } from 'vitest'
import {
  buildProjectAssetIndex,
  buildSnapshotRunSummary,
  filterSnapshotsByView,
  getSnapshotSummaryText,
  getVisibleSnapshots,
  normalizeWorkbenchSnapshot,
  sortSnapshots,
} from './snapshots'
import type { ModelResult } from '../models/types'

const snapshots = [
  { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'favorite', createdAt: '2026-01-02T00:00:00.000Z', favorite: true },
  { id: 'pinned', createdAt: '2026-01-03T00:00:00.000Z', pinned: true },
  { id: 'new', createdAt: '2026-01-04T00:00:00.000Z' },
]

describe('snapshot index helpers', () => {
  it('sorts pinned snapshots first, then favorites, then recency', () => {
    expect(sortSnapshots(snapshots).map((snapshot) => snapshot.id)).toEqual(['pinned', 'favorite', 'new', 'old'])
  })

  it('filters pinned and favorite views', () => {
    const sorted = sortSnapshots(snapshots)

    expect(filterSnapshotsByView(sorted, 'pinned').map((snapshot) => snapshot.id)).toEqual(['pinned'])
    expect(filterSnapshotsByView(sorted, 'favorite').map((snapshot) => snapshot.id)).toEqual(['favorite'])
  })

  it('limits the recent view to three entries', () => {
    expect(getVisibleSnapshots(snapshots, 'recent').map((snapshot) => snapshot.id)).toEqual(['pinned', 'favorite', 'new'])
    expect(getSnapshotSummaryText(snapshots.length, snapshots.length, 'recent')).toBe('最近 3 条')
    expect(getSnapshotSummaryText(snapshots.length, 1, 'pinned')).toBe('1 条')
  })

  it('normalizes old snapshots with metadata defaults and run summaries', () => {
    const result: ModelResult = {
      id: 'linear-regression',
      summary: [{ label: 'R-squared', value: 0.8 }],
      tables: [{ id: 'coefficients', title: '系数', columns: ['term'], rows: [{ term: 'x' }] }],
      diagnostics: [],
      warnings: ['warning'],
      message: 'done',
    }

    const snapshot = normalizeWorkbenchSnapshot({
      id: 'legacy',
      createdAt: '2026-01-01T00:00:00.000Z',
      label: 'Legacy',
      fileName: 'legacy.xlsx',
      modelId: 'ols',
      modelName: 'OLS',
      formula: 'y ~ x',
      result,
      savedResultAt: '2026-01-02T00:00:00.000Z',
      rows: [{ y: 1, x: 2 }],
    })

    expect(snapshot.note).toBe('')
    expect(snapshot.tags).toEqual([])
    expect(snapshot.favorite).toBe(false)
    expect(snapshot.pinned).toBe(false)
    expect(snapshot.runSummary).toMatchObject({
      resultId: 'linear-regression',
      metricCount: 1,
      tableCount: 1,
      warningCount: 1,
      savedResultAt: '2026-01-02T00:00:00.000Z',
    })
  })

  it('builds a project asset index for the left workbench rail', () => {
    const result: ModelResult = {
      id: 'linear-regression',
      summary: [],
      tables: [],
      diagnostics: [],
      message: '',
    }
    const savedResultAt = '2026-01-04T00:00:00.000Z'
    const resultSnapshot = normalizeWorkbenchSnapshot({
      id: 'result',
      createdAt: '2026-01-03T00:00:00.000Z',
      label: 'Result',
      modelId: 'ols',
      modelName: 'OLS',
      formula: 'y ~ x',
      result,
      savedResultAt,
      favorite: true,
      pinned: true,
    })
    const configSnapshot = normalizeWorkbenchSnapshot({
      id: 'config',
      createdAt: '2026-01-02T00:00:00.000Z',
      label: 'Config only',
      modelId: 'ols',
      modelName: 'OLS',
      formula: 'y ~ z',
    })

    const index = buildProjectAssetIndex(
      {
        fileName: 'demo.xlsx',
        rowCount: 10,
        fieldCount: 3,
        modelId: 'ols',
        modelName: '线性回归',
        modelShortName: 'OLS',
        formula: 'y ~ x',
        hasResult: true,
      },
      [configSnapshot, resultSnapshot],
    )

    expect(index.currentDataset).toMatchObject({ status: 'loaded', rowCount: 10 })
    expect(index.currentModel).toMatchObject({ status: 'has-result', shortName: 'OLS' })
    expect(index.recentResults.map((snapshot) => snapshot.id)).toEqual(['result'])
    expect(index.pinnedSnapshots.map((snapshot) => snapshot.id)).toEqual(['result'])
    expect(index.favoriteSnapshots.map((snapshot) => snapshot.id)).toEqual(['result'])
    expect(index.historyVersions.map((snapshot) => snapshot.id)).toEqual(['result', 'config'])
  })

  it('returns null run summaries when no result is present', () => {
    expect(buildSnapshotRunSummary(undefined, undefined)).toBeNull()
  })
})
