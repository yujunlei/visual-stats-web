import { formatNumber } from '../data/tableUtils'
import type { ModelConfig, ModelResult } from '../models/types'

export type PublicationTableKind = 'baseline' | 'heterogeneity' | 'robustness' | 'endogeneity' | 'custom'

export type PublicationDimensionRoles = {
  idFields: string[]
  timeField: string
  groupFields: string[]
}

export type PublicationColumn = {
  id: string
  label: string
  group?: string
  subGroup?: string
}

export type PublicationRowRole = 'title' | 'model' | 'header' | 'coefficient' | 'statistic' | 'fixedEffect' | 'metric' | 'note'

export type PublicationRow = {
  role: PublicationRowRole
  label: string
  values: Array<string | number>
}

export type PublicationMerge = {
  rowIndex: number
  columnIndex: number
  columnSpan: number
}

export type PublicationTable = {
  kind: PublicationTableKind
  title: string
  sheetName: string
  columns: PublicationColumn[]
  rows: PublicationRow[]
  notes: string[]
  merges: PublicationMerge[]
}

export type BaselinePublicationInput = {
  result: ModelResult
  config: ModelConfig
  dimensions: PublicationDimensionRoles
  modelLabel: string
  methodLabel: string
  title?: string
}

export type CustomPublicationSource = {
  id: string
  result: ModelResult
  config: ModelConfig
  dimensions: PublicationDimensionRoles
  label: string
  group?: string
  modelLabel?: string
}

export type CustomPublicationInput = {
  title: string
  sources: CustomPublicationSource[]
  note: string
}

const significanceStars = (pValue: unknown) => {
  if (typeof pValue !== 'number') return ''
  if (pValue < 0.01) return '***'
  if (pValue < 0.05) return '**'
  if (pValue < 0.1) return '*'
  return ''
}

const statisticInParentheses = (coefficient: unknown, stdError: unknown) => {
  if (typeof coefficient !== 'number' || typeof stdError !== 'number' || stdError === 0) return ''
  return `(${(coefficient / stdError).toFixed(2)})`
}

const formatPublicationCoefficient = (value: unknown) => {
  if (typeof value !== 'number') return value === undefined || value === null ? '' : String(value)
  const abs = Math.abs(value)
  if (abs === 0) return '0.000'
  if (abs >= 100) return formatNumber(value, 3)
  if (abs >= 1) return formatNumber(value, 4)
  if (abs >= 0.01) return value.toFixed(4)
  if (abs >= 0.001) return value.toFixed(5)
  return value.toPrecision(4)
}

const formatPublicationMetric = (value: unknown, kind: 'n' | 'r2') => {
  if (typeof value !== 'number') return value === undefined || value === null ? '' : String(value)
  return kind === 'n' ? formatNumber(value, 0) : value.toFixed(3)
}

const metricNumber = (result: ModelResult, label: string) => {
  const value = result.summary.find((metric) => metric.label === label)?.value
  return typeof value === 'number' ? value : ''
}

export const publicationTableToRows = (table: PublicationTable, options: { includeNotes?: boolean } = {}) => {
  const bodyRows = table.rows.map((row) => [row.label, ...row.values])
  if (!options.includeNotes) return bodyRows
  return [...bodyRows, ...table.notes.map((note) => [note, ...table.columns.map(() => '')])]
}

export const buildBaselinePublicationTable = ({
  result,
  config,
  dimensions,
  modelLabel,
  methodLabel,
  title = '表 1：基准回归结果',
}: BaselinePublicationInput): PublicationTable | null => {
  const coefficientTable = result.tables.find((table) => table.id === 'coefficients')
  if (!coefficientTable) return null

  const robustnessTable = result.tables.find((table) => table.id === 'robustness-checks') ?? null
  const robustnessModels = Array.from(new Set(robustnessTable?.rows.map((row) => String(row.model ?? '')).filter(Boolean) ?? []))
  const modelNames = robustnessModels.length > 0 ? robustnessModels.slice(0, 6) : [modelLabel || methodLabel || result.id]
  const columns = modelNames.map((model, index) => ({ id: model, label: `(${index + 1})` }))
  const coefficientByTerm = new Map(coefficientTable.rows.map((row) => [String(row.term ?? row.variable ?? ''), row]))
  const robustnessByModelTerm = new Map<string, ModelResult['tables'][number]['rows'][number]>()

  robustnessTable?.rows.forEach((row) => {
    const model = String(row.model ?? '')
    const term = String(row.term ?? row.variable ?? '')
    if (model && term) robustnessByModelTerm.set(`${model}::${term}`, row)
  })

  const orderedTerms = [
    ...config.features.filter((term) => coefficientByTerm.has(term) || modelNames.some((model) => robustnessByModelTerm.has(`${model}::${term}`))),
    ...Array.from(new Set([...(robustnessTable?.rows.map((row) => String(row.term ?? row.variable ?? '')) ?? []), ...coefficientByTerm.keys()])).filter(
      (term) => term && term !== '_cons' && !config.features.includes(term),
    ),
    ...(coefficientByTerm.has('_cons') ? ['_cons'] : []),
  ]

  const cellFor = (model: string, term: string) => {
    const row = robustnessByModelTerm.get(`${model}::${term}`) ?? (model === modelNames[0] ? coefficientByTerm.get(term) : undefined)
    if (!row) return { coefficient: '', statistic: '' }
    return {
      coefficient: `${formatPublicationCoefficient(row.coefficient)}${significanceStars(row.pValue)}`,
      statistic: statisticInParentheses(row.coefficient, row.stdError),
    }
  }

  const nByModel = (model: string) => robustnessTable?.rows.find((row) => String(row.model ?? '') === model && typeof row.n === 'number')?.n ?? metricNumber(result, 'Number of obs')
  const r2ByModel = (model: string) =>
    robustnessTable?.rows.find((row) => String(row.model ?? '') === model && typeof row.rSquared === 'number')?.rSquared ?? metricNumber(result, 'R-squared')
  const fixedEffectRows = [
    ...dimensions.groupFields.map((field) => ({ role: 'fixedEffect' as const, label: `${field} FE`, values: modelNames.map(() => 'Yes') })),
    ...dimensions.idFields.map((field) => ({ role: 'fixedEffect' as const, label: `${field} FE`, values: modelNames.map(() => 'Yes') })),
    ...(dimensions.timeField ? [{ role: 'fixedEffect' as const, label: `${dimensions.timeField} FE`, values: modelNames.map(() => 'Yes') }] : []),
  ]

  const rows: PublicationRow[] = [
    { role: 'title', label: title, values: modelNames.map(() => '') },
    { role: 'model', label: 'Model', values: [methodLabel || modelLabel, ...modelNames.slice(1).map(() => '')] },
    { role: 'header', label: 'Variables', values: columns.map((column) => column.label) },
    ...orderedTerms.flatMap((term) => {
      const label = term === '_cons' ? 'Cons' : term
      const cells = modelNames.map((model) => cellFor(model, term))
      return [
        { role: 'coefficient' as const, label, values: cells.map((cell) => cell.coefficient) },
        { role: 'statistic' as const, label: '', values: cells.map((cell) => cell.statistic) },
      ]
    }),
    ...fixedEffectRows,
    { role: 'metric', label: 'N', values: modelNames.map((model) => formatPublicationMetric(nByModel(model), 'n')) },
    { role: 'metric', label: 'Adj-R²', values: modelNames.map((model) => formatPublicationMetric(r2ByModel(model), 'r2')) },
  ]

  const noteRowIndex = rows.length

  return {
    kind: 'baseline',
    title,
    sheetName: '基准回归结果',
    columns,
    rows,
    notes: ['注：稳健标准误；括号内为 t 值；* p<0.1，** p<0.05，*** p<0.01'],
    merges: [
      { rowIndex: 0, columnIndex: 0, columnSpan: columns.length + 1 },
      { rowIndex: 1, columnIndex: 1, columnSpan: columns.length },
      { rowIndex: noteRowIndex, columnIndex: 0, columnSpan: columns.length + 1 },
    ],
  }
}

export const buildCustomPublicationTable = ({ title, sources, note }: CustomPublicationInput): PublicationTable | null => {
  if (sources.length === 0) return null

  const columnSources = sources
    .map((source, index) => {
      const coefficientTable = source.result.tables.find((table) => table.id === 'coefficients')
      if (!coefficientTable) return null
      return {
        ...source,
        coefficientTable,
        column: {
          id: source.id,
          label: source.label || `(${index + 1})`,
          group: source.group,
        } satisfies PublicationColumn,
      }
    })
    .filter((source): source is NonNullable<typeof source> => Boolean(source))

  if (columnSources.length === 0) return null

  const coefficientMaps = columnSources.map((source) => new Map(source.coefficientTable.rows.map((row) => [String(row.term ?? row.variable ?? ''), row])))
  const orderedTerms = Array.from(
    new Set([
      ...columnSources.flatMap((source) => source.config.features),
      ...coefficientMaps.flatMap((map) => Array.from(map.keys()).filter((term) => term && term !== '_cons')),
      ...coefficientMaps.flatMap((map) => (map.has('_cons') ? ['_cons'] : [])),
    ]),
  )

  const rowForTerm = (term: string) => {
    const label = term === '_cons' ? 'Cons' : term
    const cells = coefficientMaps.map((map) => {
      const row = map.get(term)
      if (!row) return { coefficient: '', statistic: '' }
      return {
        coefficient: `${formatPublicationCoefficient(row.coefficient)}${significanceStars(row.pValue)}`,
        statistic: statisticInParentheses(row.coefficient, row.stdError),
      }
    })
    return [
      { role: 'coefficient' as const, label, values: cells.map((cell) => cell.coefficient) },
      { role: 'statistic' as const, label: '', values: cells.map((cell) => cell.statistic) },
    ]
  }

  const metricFor = (source: CustomPublicationSource, label: string) => metricNumber(source.result, label)
  const hasGroups = columnSources.some((source) => source.group)
  const groupValues = columnSources.map((source) => source.group || '')
  const modelValues = columnSources.map((source) => source.modelLabel || '')
  const rows: PublicationRow[] = [
    { role: 'title', label: title || '自定义论文表', values: columnSources.map(() => '') },
    ...(hasGroups ? [{ role: 'model' as const, label: 'Model', values: groupValues }] : []),
    ...(modelValues.some(Boolean) ? [{ role: 'model' as const, label: hasGroups ? '' : 'Model', values: modelValues }] : []),
    { role: 'header', label: 'Variables', values: columnSources.map((source) => source.column.label) },
    ...orderedTerms.flatMap(rowForTerm),
    { role: 'metric', label: 'N', values: columnSources.map((source) => formatPublicationMetric(metricFor(source, 'Number of obs'), 'n')) },
    { role: 'metric', label: 'Adj-R²', values: columnSources.map((source) => formatPublicationMetric(metricFor(source, 'R-squared'), 'r2')) },
  ]

  const noteRowIndex = rows.length
  const merges: PublicationMerge[] = [
    { rowIndex: 0, columnIndex: 0, columnSpan: columnSources.length + 1 },
    { rowIndex: noteRowIndex, columnIndex: 0, columnSpan: columnSources.length + 1 },
  ]

  if (hasGroups) {
    let start = 0
    while (start < groupValues.length) {
      const group = groupValues[start]
      let end = start + 1
      while (end < groupValues.length && groupValues[end] === group) end += 1
      if (group && end - start > 1) merges.push({ rowIndex: 1, columnIndex: start + 1, columnSpan: end - start })
      start = end
    }
  }

  return {
    kind: 'custom',
    title: title || '自定义论文表',
    sheetName: '自定义论文表',
    columns: columnSources.map((source) => source.column),
    rows,
    notes: [note || '注：稳健标准误；括号内为 t 值；* p<0.1，** p<0.05，*** p<0.01'],
    merges,
  }
}
