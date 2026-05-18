import { emptyDataRoles, type DataRoles } from './dataRoles'
import type { DataPrepConfig, RunLogEntry } from './preprocess'
import type { Row, TypeOverrides } from './types'
import type { InferenceConfig, ModelConfig, ModelResult } from '../models/types'

export type SnapshotViewFilter = 'recent' | 'pinned' | 'favorite' | 'all'
export type SnapshotSaveMode = 'full' | 'result-only'

export type SnapshotIndexEntry = {
  id: string
  createdAt: string
  updatedAt?: string
  favorite?: boolean
  pinned?: boolean
}

export type SnapshotRunSummary = {
  resultId: string
  savedResultAt: string
  metricCount: number
  tableCount: number
  diagnosticCount: number
  warningCount: number
  logCount: number
  message: string
}

export type WorkbenchSnapshot = SnapshotIndexEntry & {
  label: string
  fileName: string
  rowCount: number
  fieldCount: number
  modelId: string
  modelName: string
  modelShortName?: string
  formula: string
  saveMode: SnapshotSaveMode
  hasRows: boolean
  rows: Row[]
  dataRoles: DataRoles
  typeOverrides: TypeOverrides
  prepConfig: DataPrepConfig
  inferenceConfig: InferenceConfig
  modelConfig: ModelConfig
  result?: ModelResult
  resultLogs?: RunLogEntry[]
  savedResultAt?: string
  note: string
  tags: string[]
  runSummary: SnapshotRunSummary | null
}

export type SnapshotStorageSummary = {
  snapshotCount: number
  estimatedBytes: number
  maxSnapshots: number
  maxEstimatedBytes: number
}

export type ProjectAssetCurrentState = {
  fileName: string
  rowCount: number
  fieldCount: number
  modelId: string
  modelName: string
  modelShortName?: string
  formula: string
  hasResult: boolean
  resultSavedAt?: string
}

export type ProjectAssetIndex = {
  currentDataset: {
    fileName: string
    rowCount: number
    fieldCount: number
    status: 'empty' | 'loaded'
  }
  currentModel: {
    id: string
    name: string
    shortName: string
    formula: string
    status: 'none' | 'configured' | 'has-result'
  }
  recentResults: WorkbenchSnapshot[]
  pinnedSnapshots: WorkbenchSnapshot[]
  favoriteSnapshots: WorkbenchSnapshot[]
  historyVersions: WorkbenchSnapshot[]
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

export function buildSnapshotRunSummary(result: ModelResult | undefined, savedResultAt: string | undefined, resultLogs: RunLogEntry[] = []) {
  if (!result || !savedResultAt) return null

  return {
    resultId: result.id,
    savedResultAt,
    metricCount: result.summary.length,
    tableCount: result.tables.length,
    diagnosticCount: result.diagnostics.length,
    warningCount: result.warnings?.length ?? 0,
    logCount: resultLogs.length,
    message: result.message,
  } satisfies SnapshotRunSummary
}

export function normalizeWorkbenchSnapshot(candidate: Partial<WorkbenchSnapshot>): WorkbenchSnapshot {
  const createdAt = candidate.createdAt ?? new Date(0).toISOString()
  const savedResultAt = candidate.savedResultAt
  const saveMode = candidate.saveMode ?? (candidate.hasRows === false ? 'result-only' : 'full')
  const rows = candidate.rows ?? []
  const hasRows = candidate.hasRows ?? rows.length > 0

  return {
    id: candidate.id ?? createdAt,
    createdAt,
    updatedAt: candidate.updatedAt,
    label: candidate.label ?? candidate.fileName ?? '未命名快照',
    fileName: candidate.fileName ?? '',
    rowCount: candidate.rowCount ?? candidate.rows?.length ?? 0,
    fieldCount: candidate.fieldCount ?? Object.keys(candidate.rows?.[0] ?? {}).length,
    modelId: candidate.modelId ?? '',
    modelName: candidate.modelName ?? '',
    modelShortName: candidate.modelShortName,
    formula: candidate.formula ?? '',
    saveMode,
    hasRows,
    rows,
    dataRoles: candidate.dataRoles ?? emptyDataRoles,
    typeOverrides: candidate.typeOverrides ?? {},
    prepConfig: candidate.prepConfig ?? { missingStrategy: 'drop', categoricalEncoding: 'one-hot' },
    inferenceConfig: candidate.inferenceConfig ?? { standardError: 'ols', clusterField: '' },
    modelConfig: candidate.modelConfig ?? { target: '', features: [], params: {} },
    result: candidate.result,
    resultLogs: candidate.resultLogs,
    savedResultAt,
    favorite: Boolean(candidate.favorite),
    pinned: Boolean(candidate.pinned),
    note: candidate.note ?? '',
    tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag) => tag.trim()).map((tag) => tag.trim()) : [],
    runSummary: candidate.runSummary ?? buildSnapshotRunSummary(candidate.result, savedResultAt, candidate.resultLogs),
  }
}

export function normalizeWorkbenchSnapshots(candidates: Array<Partial<WorkbenchSnapshot>> = []) {
  return candidates.map((candidate) => normalizeWorkbenchSnapshot(candidate))
}

export function buildProjectAssetIndex(current: ProjectAssetCurrentState, snapshots: WorkbenchSnapshot[]): ProjectAssetIndex {
  const historyVersions = sortSnapshots(snapshots)
  const resultSnapshots = historyVersions.filter((snapshot) => snapshot.result)

  return {
    currentDataset: {
      fileName: current.fileName,
      rowCount: current.rowCount,
      fieldCount: current.fieldCount,
      status: current.rowCount > 0 ? 'loaded' : 'empty',
    },
    currentModel: {
      id: current.modelId,
      name: current.modelName,
      shortName: current.modelShortName || current.modelName,
      formula: current.formula,
      status: current.hasResult ? 'has-result' : current.modelId ? 'configured' : 'none',
    },
    recentResults: resultSnapshots.slice(0, 5),
    pinnedSnapshots: historyVersions.filter((snapshot) => snapshot.pinned),
    favoriteSnapshots: historyVersions.filter((snapshot) => snapshot.favorite),
    historyVersions,
  }
}
