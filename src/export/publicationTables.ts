import { formatNumber } from '../data/tableUtils'
import type { ModelConfig, ModelResult } from '../models/types'
import { normalizeCustomPublicationFormatRules } from './customPublicationConfig'

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

export type PublicationRowRole = 'title' | 'model' | 'group' | 'header' | 'columnIndex' | 'coefficient' | 'statistic' | 'fixedEffect' | 'metric' | 'note'

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
  modelShortName?: string
  modelName?: string
  formula?: string
  createdAt?: string
}

export type CustomPublicationInput = {
  title: string
  sources: CustomPublicationSource[]
  note: string
  variableOrder?: string[]
  enabledStatisticIds?: string[]
  variableLabels?: Record<string, string>
  statisticLabels?: Record<string, string>
  formatRules?: PublicationFormatRules
}

export type PublicationFormatRules = {
  coefficientDigits: number
  statisticDigits: number
  nDigits: number
  r2Digits: number
  parenthesisMode: 't' | 'z' | 'stdError'
  starLevels: {
    one: number
    two: number
    three: number
  }
  missingDisplay: '' | '-' | '/'
  booleanDisplay: 'yes-no' | 'yes-blank' | 'check'
}

const publicationParenthesisLabel = (mode: PublicationFormatRules['parenthesisMode']) => {
  if (mode === 'stdError') return '标准误'
  if (mode === 'z') return 'z 值'
  return 't 值'
}

const buildPublicationNote = (rules: PublicationFormatRules) =>
  `注：稳健标准误；括号内为 ${publicationParenthesisLabel(rules.parenthesisMode)}；* p<${rules.starLevels.one}，** p<${rules.starLevels.two}，*** p<${rules.starLevels.three}。`

const significanceStars = (pValue: unknown, thresholds: PublicationFormatRules['starLevels']) => {
  if (typeof pValue !== 'number') return ''
  if (pValue < thresholds.three) return '***'
  if (pValue < thresholds.two) return '**'
  if (pValue < thresholds.one) return '*'
  return ''
}

const statisticInParentheses = (row: Record<string, unknown>, mode: 't' | 'z' | 'stdError', digits: number, missingDisplay: '' | '-' | '/') => {
  if (mode === 'stdError') {
    if (typeof row.stdError !== 'number') return missingDisplay
    return `(${row.stdError.toFixed(digits)})`
  }
  if (typeof row.coefficient !== 'number' || typeof row.stdError !== 'number' || row.stdError === 0) return missingDisplay
  return `(${(row.coefficient / row.stdError).toFixed(digits)})`
}

const formatPublicationCoefficient = (value: unknown, digits: number, missingDisplay: '' | '-' | '/') => {
  if (typeof value !== 'number') return value === undefined || value === null || value === '' ? missingDisplay : String(value)
  return value.toFixed(digits)
}

const formatPublicationMetric = (value: unknown, kind: 'n' | 'r2', digits: number, missingDisplay: '' | '-' | '/') => {
  if (typeof value !== 'number') return value === undefined || value === null || value === '' ? missingDisplay : String(value)
  return kind === 'n' ? formatNumber(value, digits) : value.toFixed(digits)
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
      coefficient: `${formatPublicationCoefficient(row.coefficient, 4, '')}${significanceStars(row.pValue, { one: 0.1, two: 0.05, three: 0.01 })}`,
      statistic: statisticInParentheses(row, 't', 2, ''),
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
    { role: 'metric', label: 'N', values: modelNames.map((model) => formatPublicationMetric(nByModel(model), 'n', 0, '')) },
    { role: 'metric', label: 'Adj-R²', values: modelNames.map((model) => formatPublicationMetric(r2ByModel(model), 'r2', 3, '')) },
  ]

  const noteRowIndex = rows.length

  return {
    kind: 'baseline',
    title,
    sheetName: '基准回归结果',
    columns,
    rows,
    notes: [buildPublicationNote({ coefficientDigits: 4, statisticDigits: 2, nDigits: 0, r2Digits: 3, parenthesisMode: 't', starLevels: { one: 0.1, two: 0.05, three: 0.01 }, missingDisplay: '', booleanDisplay: 'yes-no' })],
    merges: [
      { rowIndex: 0, columnIndex: 0, columnSpan: columns.length + 1 },
      { rowIndex: 1, columnIndex: 1, columnSpan: columns.length },
      { rowIndex: noteRowIndex, columnIndex: 0, columnSpan: columns.length + 1 },
    ],
  }
}

export const buildCustomPublicationTable = ({
  title,
  sources,
  note,
  variableOrder = [],
  enabledStatisticIds = [],
  variableLabels = {},
  statisticLabels = {},
  formatRules,
}: CustomPublicationInput): PublicationTable | null => {
  if (sources.length === 0) return null
  const rules = normalizeCustomPublicationFormatRules(formatRules ?? {
    coefficientDigits: 4,
    statisticDigits: 2,
    nDigits: 0,
    r2Digits: 3,
    parenthesisMode: 't' as const,
    starLevels: { one: 0.1, two: 0.05, three: 0.01 },
    missingDisplay: '' as const,
    booleanDisplay: 'yes-no' as const,
  })

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
  const availableTerms = Array.from(
    new Set([
      ...columnSources.flatMap((source) => source.config.features),
      ...coefficientMaps.flatMap((map) => Array.from(map.keys()).filter(Boolean)),
    ]),
  )
  const orderedTerms = [
    ...variableOrder.filter((term) => availableTerms.includes(term)),
    ...availableTerms.filter((term) => !variableOrder.includes(term)),
  ]

  const rowForTerm = (term: string) => {
    const label = variableLabels[term]?.trim() || (term === '_cons' ? 'Cons' : term)
    const cells = coefficientMaps.map((map) => {
      const row = map.get(term)
      if (!row) return { coefficient: rules.missingDisplay, statistic: rules.missingDisplay }
      return {
        coefficient: `${formatPublicationCoefficient(row.coefficient, rules.coefficientDigits, rules.missingDisplay)}${significanceStars(row.pValue, rules.starLevels)}`,
        statistic: statisticInParentheses(row, rules.parenthesisMode, rules.statisticDigits, rules.missingDisplay),
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
  const modelValues = columnSources.map((source) => source.modelLabel || source.modelShortName || source.modelName || '')

  const fixedEffectLabels = Array.from(
    new Set(
      columnSources.flatMap((source) => [
        ...source.dimensions.groupFields.map((field) => `${field} FE`),
        ...source.dimensions.idFields.map((field) => `${field} FE`),
        ...(source.dimensions.timeField ? [`${source.dimensions.timeField} FE`] : []),
      ]),
    ),
  )
  const defaultStatisticIds = ['controls', ...fixedEffectLabels.map((label) => `fe:${label}`), 'n', 'adj-r2']
  const requestedStatisticIds = enabledStatisticIds.length > 0 ? enabledStatisticIds : defaultStatisticIds
  const statisticRowsById = new Map<string, PublicationRow>()

  statisticRowsById.set('controls', {
    role: 'fixedEffect',
    label: statisticLabels.controls?.trim() || 'Controls',
    values: columnSources.map((source) => (source.config.features.length > 0 ? (rules.booleanDisplay === 'check' ? '✓' : 'Yes') : rules.booleanDisplay === 'yes-no' ? 'No' : '')),
  })

  fixedEffectLabels.forEach((label) => {
    statisticRowsById.set(`fe:${label}`, {
      role: 'fixedEffect',
      label: statisticLabels[`fe:${label}`]?.trim() || label,
      values: columnSources.map((source) => {
        const labels = new Set([
          ...source.dimensions.groupFields.map((field) => `${field} FE`),
          ...source.dimensions.idFields.map((field) => `${field} FE`),
          ...(source.dimensions.timeField ? [`${source.dimensions.timeField} FE`] : []),
        ])
        return labels.has(label) ? (rules.booleanDisplay === 'check' ? '✓' : 'Yes') : rules.booleanDisplay === 'yes-no' ? 'No' : ''
      }),
    })
  })

  statisticRowsById.set('n', {
    role: 'metric',
    label: statisticLabels.n?.trim() || 'N',
    values: columnSources.map((source) => formatPublicationMetric(metricFor(source, 'Number of obs'), 'n', rules.nDigits, rules.missingDisplay)),
  })

  statisticRowsById.set('adj-r2', {
    role: 'metric',
    label: statisticLabels['adj-r2']?.trim() || 'Adj-R²',
    values: columnSources.map((source) => formatPublicationMetric(metricFor(source, 'R-squared'), 'r2', rules.r2Digits, rules.missingDisplay)),
  })

  const statisticRows = requestedStatisticIds.flatMap((id) => {
    const row = statisticRowsById.get(id)
    return row ? [row] : []
  })

  const defaultColumnLabels = columnSources.map((_, index) => `(${index + 1})`)
  const columnLabels = columnSources.map((source) => source.column.label)
  const hasCustomColumnLabels = columnLabels.some((label, index) => label.trim() && label.trim() !== defaultColumnLabels[index])
  const rows: PublicationRow[] = [{ role: 'title', label: title || '自定义论文表', values: columnSources.map(() => '') }]

  if (modelValues.some(Boolean)) {
    rows.push({ role: 'model', label: 'Model', values: modelValues })
  }
  if (hasGroups) {
    rows.push({ role: 'group', label: '', values: groupValues })
  }
  if (hasCustomColumnLabels) {
    rows.push({ role: 'header', label: 'Variables', values: columnLabels })
    rows.push({ role: 'columnIndex', label: '', values: defaultColumnLabels })
  } else {
    rows.push({ role: 'columnIndex', label: 'Variables', values: defaultColumnLabels })
  }
  rows.push(...orderedTerms.flatMap(rowForTerm), ...statisticRows)

  const noteRowIndex = rows.length
  const merges: PublicationMerge[] = [
    { rowIndex: 0, columnIndex: 0, columnSpan: columnSources.length + 1 },
    { rowIndex: noteRowIndex, columnIndex: 0, columnSpan: columnSources.length + 1 },
  ]

  if (hasGroups) {
    const groupRowIndex = rows.findIndex((row) => row.role === 'group')
    let start = 0
    while (start < groupValues.length) {
      const group = groupValues[start]
      let end = start + 1
      while (end < groupValues.length && groupValues[end] === group) end += 1
      if (group && end - start > 1) merges.push({ rowIndex: groupRowIndex, columnIndex: start + 1, columnSpan: end - start })
      start = end
    }
  }

  const modelRowIndex = rows.findIndex((row) => row.role === 'model')
  if (modelRowIndex > -1 && columnSources.length > 1) {
    let start = 0
    while (start < modelValues.length) {
      const model = modelValues[start]
      let end = start + 1
      while (end < modelValues.length && modelValues[end] === model) end += 1
      if (model && end - start > 1) merges.push({ rowIndex: modelRowIndex, columnIndex: start + 1, columnSpan: end - start })
      start = end
    }
  }

  return {
    kind: 'custom',
    title: title || '自定义论文表',
    sheetName: '自定义论文表',
    columns: columnSources.map((source) => source.column),
    rows,
    notes: [note || buildPublicationNote(rules)],
    merges,
  }
}
