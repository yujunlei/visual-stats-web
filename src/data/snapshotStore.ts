import { snapshotStorageKey } from '../constants/workbench'
import { normalizeWorkbenchSnapshot, type SnapshotStorageSummary, type WorkbenchSnapshot } from './snapshots'

export type SnapshotMeta = Omit<WorkbenchSnapshot, 'rows' | 'dataRoles' | 'typeOverrides' | 'prepConfig' | 'inferenceConfig' | 'modelConfig' | 'result' | 'resultLogs'>

export type SnapshotPayload = Pick<
  WorkbenchSnapshot,
  'id' | 'hasRows' | 'dataRoles' | 'typeOverrides' | 'prepConfig' | 'inferenceConfig' | 'modelConfig' | 'result' | 'resultLogs'
> & {
  rows?: WorkbenchSnapshot['rows']
}

export const defaultSnapshotStorageLimits = {
  maxSnapshots: 30,
  maxEstimatedBytes: 30 * 1024 * 1024,
}

const dbName = 'visual-stats-lab:snapshots'
const dbVersion = 1
const metaStoreName = 'metas'
const payloadStoreName = 'payloads'

export const toSnapshotMeta = (snapshot: WorkbenchSnapshot): SnapshotMeta => {
  const meta = { ...snapshot } as Partial<WorkbenchSnapshot>
  delete meta.rows
  delete meta.dataRoles
  delete meta.typeOverrides
  delete meta.prepConfig
  delete meta.inferenceConfig
  delete meta.modelConfig
  delete meta.result
  delete meta.resultLogs
  return meta as SnapshotMeta
}

export const toSnapshotPayload = (snapshot: WorkbenchSnapshot): SnapshotPayload => ({
  id: snapshot.id,
  hasRows: snapshot.hasRows,
  ...(snapshot.hasRows ? { rows: snapshot.rows } : {}),
  dataRoles: snapshot.dataRoles,
  typeOverrides: snapshot.typeOverrides,
  prepConfig: snapshot.prepConfig,
  inferenceConfig: snapshot.inferenceConfig,
  modelConfig: snapshot.modelConfig,
  result: snapshot.result,
  resultLogs: snapshot.resultLogs,
})

export const mergeSnapshotRecord = (meta: SnapshotMeta, payload?: Partial<SnapshotPayload>) =>
  normalizeWorkbenchSnapshot({
    ...meta,
    ...payload,
    id: meta.id,
  })

const estimateJsonBytes = (value: unknown) => {
  try {
    return new Blob([JSON.stringify(value)]).size
  } catch {
    return 0
  }
}

export function estimateSnapshotBytes(snapshot: WorkbenchSnapshot) {
  return estimateJsonBytes(toSnapshotMeta(snapshot)) + estimateJsonBytes(toSnapshotPayload(snapshot))
}

export function summarizeSnapshotStorage(
  snapshots: WorkbenchSnapshot[],
  limits = defaultSnapshotStorageLimits,
): SnapshotStorageSummary {
  return {
    snapshotCount: snapshots.length,
    estimatedBytes: snapshots.reduce((total, snapshot) => total + estimateSnapshotBytes(snapshot), 0),
    maxSnapshots: limits.maxSnapshots,
    maxEstimatedBytes: limits.maxEstimatedBytes,
  }
}

export function enforceSnapshotCapacity(
  snapshots: WorkbenchSnapshot[],
  limits = defaultSnapshotStorageLimits,
) {
  let nextSnapshots = [...snapshots]
  const canKeep = () => {
    const summary = summarizeSnapshotStorage(nextSnapshots, limits)
    return summary.snapshotCount <= limits.maxSnapshots && summary.estimatedBytes <= limits.maxEstimatedBytes
  }

  while (nextSnapshots.length > 0 && !canKeep()) {
    const removalCandidate = [...nextSnapshots]
      .map((snapshot, index) => ({ snapshot, index }))
      .sort((left, right) => {
        const leftPriority = Number(Boolean(left.snapshot.pinned)) * 4 + Number(Boolean(left.snapshot.favorite)) * 2
        const rightPriority = Number(Boolean(right.snapshot.pinned)) * 4 + Number(Boolean(right.snapshot.favorite)) * 2
        if (leftPriority !== rightPriority) return leftPriority - rightPriority

        const leftTime = new Date(left.snapshot.updatedAt ?? left.snapshot.createdAt).getTime()
        const rightTime = new Date(right.snapshot.updatedAt ?? right.snapshot.createdAt).getTime()
        return leftTime - rightTime
      })[0]

    if (!removalCandidate) break
    nextSnapshots = nextSnapshots.filter((_, index) => index !== removalCandidate.index)
  }

  return nextSnapshots
}

const getIndexedDb = () => (typeof indexedDB === 'undefined' ? null : indexedDB)

function openSnapshotDb() {
  const dbFactory = getIndexedDb()
  if (!dbFactory) return Promise.resolve<IDBDatabase | null>(null)

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = dbFactory.open(dbName, dbVersion)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(metaStoreName)) db.createObjectStore(metaStoreName, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(payloadStoreName)) db.createObjectStore(payloadStoreName, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'))
  })
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string) {
  return new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve((request.result ?? []) as T[])
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB read failed: ${storeName}`))
  })
}

export async function loadSnapshotsFromIndexedDb() {
  const db = await openSnapshotDb()
  if (!db) return []
  try {
    const [metas, payloads] = await Promise.all([
      getAllFromStore<SnapshotMeta>(db, metaStoreName),
      getAllFromStore<SnapshotPayload>(db, payloadStoreName),
    ])
    const payloadById = new Map(payloads.map((payload) => [payload.id, payload]))
    return metas.map((meta) => mergeSnapshotRecord(meta, payloadById.get(meta.id)))
  } finally {
    db.close()
  }
}

function deleteMissingSnapshots(store: IDBObjectStore, ids: Set<string>) {
  const request = store.getAllKeys()
  request.onsuccess = () => {
    request.result.forEach((key) => {
      if (typeof key === 'string' && !ids.has(key)) store.delete(key)
    })
  }
}

export async function persistSnapshotsToIndexedDb(snapshots: WorkbenchSnapshot[]) {
  const db = await openSnapshotDb()
  if (!db) return
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([metaStoreName, payloadStoreName], 'readwrite')
      const metaStore = transaction.objectStore(metaStoreName)
      const payloadStore = transaction.objectStore(payloadStoreName)
      const ids = new Set(snapshots.map((snapshot) => snapshot.id))
      snapshots.forEach((snapshot) => {
        metaStore.put(toSnapshotMeta(snapshot))
        payloadStore.put(toSnapshotPayload(snapshot))
      })
      deleteMissingSnapshots(metaStore, ids)
      deleteMissingSnapshots(payloadStore, ids)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed.'))
    })
  } finally {
    db.close()
  }
}

export const clearLegacySnapshotStorage = () => {
  try {
    window.localStorage.removeItem(snapshotStorageKey)
  } catch {
    // Best effort cleanup only.
  }
}
