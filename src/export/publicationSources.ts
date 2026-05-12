import { emptyDataRoles, type DataRoles } from '../data/dataRoles'
import type { ModelConfig, ModelResult } from '../models/types'
import type { CustomPublicationSource } from './publicationTables'

export type PublicationSnapshotSource = {
  id: string
  label: string
  modelId: string
  modelName: string
  modelShortName?: string
  formula: string
  modelConfig: ModelConfig
  dataRoles?: DataRoles
  result?: ModelResult
  createdAt: string
  savedResultAt?: string
}

export type BuildPublicationSourcesInput = {
  current?: {
    result: ModelResult | null
    config: ModelConfig
    dimensions: DataRoles
    modelName: string
    modelShortName: string
    formula: string
    createdAt?: string
  }
  snapshots: PublicationSnapshotSource[]
  getModelShortName: (modelId: string) => string
}

export function buildPublicationSources({ current, snapshots, getModelShortName }: BuildPublicationSourcesInput): CustomPublicationSource[] {
  const currentSource =
    current?.result
      ? [
          {
            id: 'current',
            label: `当前结果 · ${current.modelName}`,
            result: current.result,
            config: current.config,
            dimensions: current.dimensions,
            modelName: current.modelName,
            modelShortName: current.modelShortName || current.modelName,
            formula: current.formula,
            createdAt: current.createdAt ?? new Date().toISOString(),
          },
        ]
      : []

  const snapshotSources = snapshots
    .filter((snapshot) => snapshot.result)
    .map((snapshot) => ({
      id: `snapshot:${snapshot.id}`,
      label: snapshot.label,
      result: snapshot.result as ModelResult,
      config: snapshot.modelConfig,
      dimensions: snapshot.dataRoles ?? emptyDataRoles,
      modelName: snapshot.modelName,
      modelShortName: snapshot.modelShortName || getModelShortName(snapshot.modelId) || snapshot.modelName,
      formula: snapshot.formula,
      createdAt: snapshot.savedResultAt ?? snapshot.createdAt,
    }))

  return [...currentSource, ...snapshotSources]
}

export const hasCoefficientPublicationSource = (sources: CustomPublicationSource[]) =>
  sources.some((source) => source.result.tables.some((table) => table.id === 'coefficients'))
