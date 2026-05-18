import type { Row } from '../data/types'

export const dataImportLimits = {
  maxFileSizeBytes: 50 * 1024 * 1024,
  maxRows: 200_000,
  maxColumns: 200,
}

export type DataImportWorkerRequest = {
  taskId: string
  file: File
  fileType: 'csv' | 'xlsx'
}

export type DataImportWorkerProgress = {
  type: 'progress'
  taskId: string
  phase: string
  progress: number
}

export type DataImportWorkerSuccess = {
  type: 'success'
  taskId: string
  rows: Row[]
}

export type DataImportWorkerFailure = {
  type: 'error'
  taskId: string
  error: string
}

export type DataImportWorkerMessage = DataImportWorkerProgress | DataImportWorkerSuccess | DataImportWorkerFailure
