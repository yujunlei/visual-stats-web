export type SnapshotViewFilter = 'recent' | 'pinned' | 'favorite' | 'all'

export type SnapshotIndexEntry = {
  id: string
  createdAt: string
  updatedAt?: string
  favorite?: boolean
  pinned?: boolean
}

export const snapshotFilterOptions: Array<{ id: SnapshotViewFilter; label: string }> = [
  { id: 'recent', label: '最近' },
  { id: 'pinned', label: '置顶' },
  { id: 'favorite', label: '收藏' },
  { id: 'all', label: '全部' },
]

export function sortSnapshots<TSnapshot extends SnapshotIndexEntry>(snapshots: TSnapshot[]) {
  return [...snapshots].sort((left, right) => {
    const pinnedDelta = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
    if (pinnedDelta !== 0) return pinnedDelta

    const favoriteDelta = Number(Boolean(right.favorite)) - Number(Boolean(left.favorite))
    if (favoriteDelta !== 0) return favoriteDelta

    return new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime()
  })
}

export function filterSnapshotsByView<TSnapshot extends SnapshotIndexEntry>(snapshots: TSnapshot[], filter: SnapshotViewFilter) {
  if (filter === 'pinned') return snapshots.filter((snapshot) => snapshot.pinned)
  if (filter === 'favorite') return snapshots.filter((snapshot) => snapshot.favorite)
  return snapshots
}

export function getVisibleSnapshots<TSnapshot extends SnapshotIndexEntry>(snapshots: TSnapshot[], filter: SnapshotViewFilter) {
  const sorted = sortSnapshots(snapshots)
  const filtered = filterSnapshotsByView(sorted, filter)

  return filter === 'recent' ? filtered.slice(0, 3) : filtered
}

export function getSnapshotSummaryText(snapshotCount: number, filteredCount: number, filter: SnapshotViewFilter) {
  return filter === 'recent' ? `最近 ${Math.min(3, snapshotCount)} 条` : `${filteredCount} 条`
}
