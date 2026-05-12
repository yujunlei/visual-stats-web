import { describe, expect, it } from 'vitest'
import { filterSnapshotsByView, getSnapshotSummaryText, getVisibleSnapshots, sortSnapshots } from './snapshots'

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
})
