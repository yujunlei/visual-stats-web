import { emptyDataRoles, type DataRoles } from '../data/dataRoles'
import type { WorkbenchSnapshot } from '../data/snapshots'
import type { CustomPublicationConfig } from '../export/customPublicationConfig'
import { customPublicationAsCustom } from '../export/customPublicationActions'
import type { CustomPublicationSource } from '../export/publicationTables'
import type { ModelConfig, ModelResult } from './types'

export type ModelComparisonSourceOrigin = 'current' | 'snapshot'

export type ModelComparisonSource = {
  id: string
  origin: ModelComparisonSourceOrigin
  label: string
  modelId: string
  modelName: string
  modelShortName: string
  formula: string
  result: ModelResult
  modelConfig: ModelConfig
  dataRoles: DataRoles
  createdAt: string
  savedResultAt?: string
}

export type BuildModelComparisonSourcesInput = {
  current?: {
    result: ModelResult | null
    modelId: string
    modelName: string
    modelShortName?: string
    formula: string
    modelConfig: ModelConfig
    dataRoles: DataRoles
    createdAt?: string
  }
  snapshots: WorkbenchSnapshot[]
}

export type ModelComparisonRowRole = 'model' | 'formula' | 'metric' | 'coefficient'

export type ModelComparisonRow = {
  id: string
  role: ModelComparisonRowRole
  label: string
  values: Array<string | number>
}

export type ModelComparisonTable = {
  sourceIds: string[]
  columns: Array<{ id: string; label: string; origin: ModelComparisonSourceOrigin }>
  rows: ModelComparisonRow[]
}

const preferredMetricLabels = ['Number of obs', 'R-squared', 'Adjusted R-squared', 'AIC', 'BIC', 'Log likelihood', 'F-statistic']

const valueForMetric = (result: ModelResult, label: string) => result.summary.find((metric) => metric.label === label)?.value ?? ''

const coefficientRows = (result: ModelResult) => result.tables.find((table) => table.id === 'coefficients')?.rows ?? []

const coefficientTerm = (row: Record<string, string | number>) => String(row.term ?? row.variable ?? '').trim()

const formatCoefficient = (row: Record<string, string | number> | undefined) => {
  if (!row) return ''
  const coefficient = row.coefficient
  if (typeof coefficient !== 'number') return coefficient === undefined ? '' : String(coefficient)
  const pValue = typeof row.pValue === 'number' ? row.pValue : undefined
  const stars = pValue === undefined ? '' : pValue < 0.01 ? '***' : pValue < 0.05 ? '**' : pValue < 0.1 ? '*' : ''
  return `${coefficient.toFixed(4)}${stars}`
}

export function buildModelComparisonSources({ current, snapshots }: BuildModelComparisonSourcesInput): ModelComparisonSource[] {
  const currentSources =
    current?.result
      ? [
          {
            id: 'current',
            origin: 'current' as const,
            label: `当前结果 · ${current.modelName}`,
            modelId: current.modelId,
            modelName: current.modelName,
            modelShortName: current.modelShortName || current.modelName,
            formula: current.formula,
            result: current.result,
            modelConfig: current.modelConfig,
            dataRoles: current.dataRoles,
            createdAt: current.createdAt ?? new Date().toISOString(),
            savedResultAt: current.createdAt,
          },
        ]
      : []

  const snapshotSources = snapshots
    .filter((snapshot) => snapshot.result)
    .map((snapshot) => ({
      id: `snapshot:${snapshot.id}`,
      origin: 'snapshot' as const,
      label: snapshot.label,
      modelId: snapshot.modelId,
      modelName: snapshot.modelName,
      modelShortName: snapshot.modelShortName || snapshot.modelName,
      formula: snapshot.formula,
      result: snapshot.result as ModelResult,
      modelConfig: snapshot.modelConfig,
      dataRoles: snapshot.dataRoles ?? emptyDataRoles,
      createdAt: snapshot.createdAt,
      savedResultAt: snapshot.savedResultAt,
    }))

  return [...currentSources, ...snapshotSources]
}

export function buildModelComparisonTable(sources: ModelComparisonSource[], selectedSourceIds: string[] = sources.map((source) => source.id)) {
  const selectedIdSet = new Set(selectedSourceIds)
  const selectedSources = sources.filter((source) => selectedIdSet.has(source.id))
  if (selectedSources.length === 0) return null

  const metricLabels = [
    ...preferredMetricLabels.filter((label) => selectedSources.some((source) => valueForMetric(source.result, label) !== '')),
    ...Array.from(new Set(selectedSources.flatMap((source) => source.result.summary.map((metric) => metric.label)))).filter(
      (label) => !preferredMetricLabels.includes(label),
    ),
  ].slice(0, 8)

  const coefficientMaps = selectedSources.map((source) => new Map(coefficientRows(source.result).map((row) => [coefficientTerm(row), row])))
  const configuredTerms = selectedSources.flatMap((source) => source.modelConfig.features)
  const coefficientTerms = [
    ...configuredTerms,
    ...coefficientMaps.flatMap((map) => Array.from(map.keys())),
  ].filter((term, index, terms) => term && terms.indexOf(term) === index)

  const rows: ModelComparisonRow[] = [
    { id: 'model-short-name', role: 'model', label: '模型简称', values: selectedSources.map((source) => source.modelShortName) },
    { id: 'formula', role: 'formula', label: '公式', values: selectedSources.map((source) => source.formula) },
    ...metricLabels.map((label) => ({
      id: `metric:${label}`,
      role: 'metric' as const,
      label,
      values: selectedSources.map((source) => valueForMetric(source.result, label)),
    })),
    ...coefficientTerms.map((term) => ({
      id: `coefficient:${term}`,
      role: 'coefficient' as const,
      label: term === '_cons' ? 'Cons' : term,
      values: coefficientMaps.map((map) => formatCoefficient(map.get(term))),
    })),
  ]

  return {
    sourceIds: selectedSources.map((source) => source.id),
    columns: selectedSources.map((source) => ({ id: source.id, label: source.label, origin: source.origin })),
    rows,
  } satisfies ModelComparisonTable
}

export function modelComparisonSourcesToCustomPublicationSources(sources: ModelComparisonSource[]): CustomPublicationSource[] {
  return sources.map((source) => ({
    id: source.id,
    result: source.result,
    config: source.modelConfig,
    dimensions: source.dataRoles,
    label: source.label,
    modelShortName: source.modelShortName,
    modelName: source.modelName,
    formula: source.formula,
    createdAt: source.savedResultAt ?? source.createdAt,
  }))
}

export function createCustomPublicationConfigFromComparison(
  current: CustomPublicationConfig,
  sources: ModelComparisonSource[],
  selectedSourceIds = sources.map((source) => source.id),
) {
  const selectedSources = sources.filter((source) => selectedSourceIds.includes(source.id))
  const selectedIds = selectedSources.map((source) => source.id)
  const custom = customPublicationAsCustom(current, selectedIds)

  return {
    ...custom,
    selectedSourceIds: selectedIds,
    columnOrder: selectedIds,
    columns: {
      ...custom.columns,
      ...Object.fromEntries(
        selectedSources.map((source, index) => [
          source.id,
          {
            id: source.id,
            label: `(${index + 1})`,
            group: source.origin === 'current' ? '当前结果' : '历史快照',
            modelLabel: source.modelShortName || source.modelName,
          },
        ]),
      ),
    },
  } satisfies CustomPublicationConfig
}
