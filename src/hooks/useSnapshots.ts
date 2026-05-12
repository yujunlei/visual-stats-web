import { useMemo, useState } from 'react'
import type { DataPrepConfig, RunLogEntry } from '../data/preprocess'
import type { Row, TypeOverrides } from '../data/types'
import type { DataRoles } from '../data/dataRoles'
import {
  filterSnapshotsByView,
  getSnapshotSummaryText,
  getVisibleSnapshots,
  sortSnapshots,
  type SnapshotViewFilter,
} from '../data/snapshots'
import type { InferenceConfig, ModelConfig, ModelPlugin, ModelResult } from '../models/types'
import { snapshotStorageKey } from '../constants/workbench'

export type WorkbenchSnapshot = {
  id: string
  createdAt: string
  updatedAt?: string
  label: string
  fileName: string
  rowCount: number
  fieldCount: number
  modelId: string
  modelName: string
  modelShortName?: string
  formula: string
  rows: Row[]
  dataRoles: DataRoles
  typeOverrides: TypeOverrides
  prepConfig: DataPrepConfig
  inferenceConfig: InferenceConfig
  modelConfig: ModelConfig
  result?: ModelResult
  resultLogs?: RunLogEntry[]
  savedResultAt?: string
  favorite?: boolean
  pinned?: boolean
  tags?: string[]
}

export type SnapshotDraftInput = {
  activeModel: ModelPlugin
  fileName: string
  rows: Row[]
  fieldCount: number
  dataRoles: DataRoles
  typeOverrides: TypeOverrides
  prepConfig: DataPrepConfig
  inferenceConfig: InferenceConfig
  modelConfig: ModelConfig
  result: ModelResult | null
  resultLogs: RunLogEntry[]
}

export const loadSnapshots = () => {
  try {
    const stored = window.localStorage.getItem(snapshotStorageKey)
    return stored ? (JSON.parse(stored) as WorkbenchSnapshot[]) : []
  } catch {
    return []
  }
}

export function createWorkbenchSnapshot(input: SnapshotDraftInput, now = new Date().toISOString()): WorkbenchSnapshot {
  return {
    id: `${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    label: `${input.activeModel.name} · ${input.fileName}`,
    fileName: input.fileName,
    rowCount: input.rows.length,
    fieldCount: input.fieldCount,
    modelId: input.activeModel.id,
    modelName: input.activeModel.name,
    modelShortName: input.activeModel.shortName || input.activeModel.name,
    formula: input.activeModel.getFormula(input.modelConfig),
    rows: input.rows,
    dataRoles: input.dataRoles,
    typeOverrides: input.typeOverrides,
    prepConfig: input.prepConfig,
    inferenceConfig: input.inferenceConfig,
    modelConfig: input.modelConfig,
    result: input.result ?? undefined,
    resultLogs: input.result ? input.resultLogs : undefined,
    savedResultAt: input.result ? now : undefined,
    favorite: false,
    pinned: false,
    tags: [],
  }
}

type UseSnapshotsOptions = {
  onPersistError: (message: string) => void
  onRestoreSnapshot: (snapshot: WorkbenchSnapshot) => void
  confirmDelete?: (message: string) => boolean
  maxSnapshots?: number
}

export function useSnapshots({
  onPersistError,
  onRestoreSnapshot,
  confirmDelete = (message) => window.confirm(message),
  maxSnapshots = 30,
}: UseSnapshotsOptions) {
  const [snapshotViewFilter, setSnapshotViewFilter] = useState<SnapshotViewFilter>('recent')
  const [snapshots, setSnapshots] = useState<WorkbenchSnapshot[]>(loadSnapshots)
  const [renamingSnapshotId, setRenamingSnapshotId] = useState('')
  const [snapshotNameDraft, setSnapshotNameDraft] = useState('')
  const [selectedSnapshotIds, setSelectedSnapshotIds] = useState<string[]>([])
  const [isSnapshotManageMode, setIsSnapshotManageMode] = useState(false)

  const selectedSnapshotIdSet = useMemo(() => new Set(selectedSnapshotIds), [selectedSnapshotIds])
  const sortedSnapshots = useMemo(() => sortSnapshots(snapshots), [snapshots])
  const filteredSnapshots = useMemo(() => filterSnapshotsByView(sortedSnapshots, snapshotViewFilter), [snapshotViewFilter, sortedSnapshots])
  const visibleSnapshots = useMemo(() => getVisibleSnapshots(snapshots, snapshotViewFilter), [snapshots, snapshotViewFilter])
  const visibleSnapshotIds = useMemo(() => visibleSnapshots.map((snapshot) => snapshot.id), [visibleSnapshots])
  const selectedSnapshots = useMemo(() => snapshots.filter((snapshot) => selectedSnapshotIdSet.has(snapshot.id)), [selectedSnapshotIdSet, snapshots])
  const selectedSnapshotsAllPinned = selectedSnapshots.length > 0 && selectedSnapshots.every((snapshot) => snapshot.pinned)
  const selectedSnapshotsAllFavorite = selectedSnapshots.length > 0 && selectedSnapshots.every((snapshot) => snapshot.favorite)
  const snapshotSummaryText = getSnapshotSummaryText(sortedSnapshots.length, filteredSnapshots.length, snapshotViewFilter)

  const persistSnapshots = (nextSnapshots: WorkbenchSnapshot[]) => {
    setSnapshots(nextSnapshots)
    try {
      window.localStorage.setItem(snapshotStorageKey, JSON.stringify(nextSnapshots))
    } catch {
      onPersistError('快照保存失败：浏览器本地存储空间不足。')
    }
  }

  const saveSnapshot = (input: SnapshotDraftInput) => {
    const snapshot = createWorkbenchSnapshot(input)
    persistSnapshots([snapshot, ...snapshots].slice(0, maxSnapshots))
  }

  const restoreSnapshot = (snapshot: WorkbenchSnapshot) => {
    onRestoreSnapshot(snapshot)
    setSelectedSnapshotIds([])
    setIsSnapshotManageMode(false)
  }

  const startRenameSnapshot = (snapshot: WorkbenchSnapshot) => {
    setRenamingSnapshotId(snapshot.id)
    setSnapshotNameDraft(snapshot.label)
  }

  const cancelRenameSnapshot = () => {
    setRenamingSnapshotId('')
    setSnapshotNameDraft('')
  }

  const commitRenameSnapshot = (snapshotId: string) => {
    const nextLabel = snapshotNameDraft.trim()
    if (!nextLabel) return

    persistSnapshots(snapshots.map((snapshot) => (snapshot.id === snapshotId ? { ...snapshot, label: nextLabel, updatedAt: new Date().toISOString() } : snapshot)))
    cancelRenameSnapshot()
  }

  const toggleSnapshotFlag = (snapshotId: string, flag: 'favorite' | 'pinned') => {
    persistSnapshots(
      snapshots.map((snapshot) =>
        snapshot.id === snapshotId ? { ...snapshot, [flag]: !snapshot[flag], updatedAt: new Date().toISOString() } : snapshot,
      ),
    )
  }

  const toggleSnapshotSelection = (snapshotId: string) => {
    setSelectedSnapshotIds((current) =>
      current.includes(snapshotId) ? current.filter((id) => id !== snapshotId) : [...current, snapshotId],
    )
  }

  const toggleAllSnapshots = () => {
    setSelectedSnapshotIds((current) => {
      const visibleIdSet = new Set(visibleSnapshotIds)
      const allVisibleSelected = visibleSnapshotIds.length > 0 && visibleSnapshotIds.every((id) => current.includes(id))
      if (allVisibleSelected) return current.filter((id) => !visibleIdSet.has(id))

      return [...new Set([...current, ...visibleSnapshotIds])]
    })
  }

  const setSelectedSnapshotFlag = (flag: 'favorite' | 'pinned', value: boolean) => {
    if (selectedSnapshotIds.length === 0) return

    persistSnapshots(
      snapshots.map((snapshot) =>
        selectedSnapshotIdSet.has(snapshot.id) ? { ...snapshot, [flag]: value, updatedAt: new Date().toISOString() } : snapshot,
      ),
    )
  }

  const deleteSelectedSnapshots = () => {
    if (selectedSnapshotIds.length === 0) return
    const confirmed = confirmDelete(`确定删除选中的 ${selectedSnapshotIds.length} 条快照吗？`)
    if (!confirmed) return

    persistSnapshots(snapshots.filter((snapshot) => !selectedSnapshotIdSet.has(snapshot.id)))
    setSelectedSnapshotIds([])
    setIsSnapshotManageMode(false)
  }

  const deleteSnapshot = (snapshot: WorkbenchSnapshot) => {
    const confirmed = confirmDelete(`确定删除快照“${snapshot.label}”吗？此操作只会删除这条本地历史记录。`)
    if (!confirmed) return

    persistSnapshots(snapshots.filter((entry) => entry.id !== snapshot.id))
    setSelectedSnapshotIds((current) => current.filter((id) => id !== snapshot.id))
    if (renamingSnapshotId === snapshot.id) {
      cancelRenameSnapshot()
    }
  }

  return {
    snapshotViewFilter,
    setSnapshotViewFilter,
    snapshots,
    renamingSnapshotId,
    snapshotNameDraft,
    setSnapshotNameDraft,
    selectedSnapshotIds,
    setSelectedSnapshotIds,
    isSnapshotManageMode,
    setIsSnapshotManageMode,
    selectedSnapshotIdSet,
    sortedSnapshots,
    filteredSnapshots,
    visibleSnapshots,
    visibleSnapshotIds,
    selectedSnapshots,
    selectedSnapshotsAllPinned,
    selectedSnapshotsAllFavorite,
    snapshotSummaryText,
    saveSnapshot,
    restoreSnapshot,
    startRenameSnapshot,
    cancelRenameSnapshot,
    commitRenameSnapshot,
    toggleSnapshotFlag,
    toggleSnapshotSelection,
    toggleAllSnapshots,
    setSelectedSnapshotFlag,
    deleteSelectedSnapshots,
    deleteSnapshot,
  }
}
