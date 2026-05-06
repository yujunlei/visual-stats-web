import type { CellValue } from 'read-excel-file/browser'
import type { ColumnType, Row, TypeOverrides, VariableProfile } from './types'

type RawCell = CellValue | null

export const formatNumber = (value: number, digits = 3) =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : 'NA'

export const toNumber = (value: Row[string]) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined || String(value).trim() === '') return null
  const normalized = Number(String(value).replaceAll(',', ''))
  return Number.isFinite(normalized) ? normalized : null
}

const isDateLike = (value: Row[string]) => {
  if (typeof value !== 'string') return false
  if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value.trim())) return false
  return Number.isFinite(Date.parse(value))
}

const inferType = (values: Row[string][], numericValues: number[], missing: number): ColumnType => {
  if (values.length === missing) return 'empty'

  const nonMissing = values.filter((value) => value !== null && value !== '')
  if (numericValues.length >= values.length - missing) return 'numeric'
  if (nonMissing.length > 0 && nonMissing.filter(isDateLike).length >= nonMissing.length * 0.8) return 'date'
  return 'category'
}

export const profileRows = (rows: Row[], overrides: TypeOverrides = {}): VariableProfile[] => {
  const columns = Object.keys(rows[0] ?? {})

  return columns.map((name) => {
    const values = rows.map((row) => row[name])
    const numericValues = values.map(toNumber).filter((value): value is number => value !== null)
    const missing = values.length - values.filter((value) => value !== null && value !== '').length
    const unique = new Set(values.filter((value) => value !== null && value !== '')).size
    const inferredType = inferType(values, numericValues, missing)
    const type = overrides[name] ?? inferredType

    return {
      name,
      type,
      inferredType,
      missing,
      unique,
      min: numericValues.length > 0 ? Math.min(...numericValues) : undefined,
      max: numericValues.length > 0 ? Math.max(...numericValues) : undefined,
    }
  })
}

const normalizeHeader = (value: RawCell, index: number, existing: Set<string>) => {
  const base = String(value ?? `column_${index + 1}`)
    .trim()
    .replace(/\s+/g, '_')
  const fallback = base || `column_${index + 1}`
  let name = fallback
  let suffix = 2

  while (existing.has(name)) {
    name = `${fallback}_${suffix}`
    suffix += 1
  }

  existing.add(name)
  return name
}

const normalizeCell = (value: RawCell): Row[string] => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

export const rowsFromSheet = (sheetRows: RawCell[][]) => {
  const nonEmptyRows = sheetRows.filter((row) => row.some((cell) => cell !== null && cell !== ''))
  const headerRow = nonEmptyRows[0]

  if (!headerRow) return []

  const existing = new Set<string>()
  const headers = headerRow.map((cell, index) => normalizeHeader(cell, index, existing))

  return nonEmptyRows.slice(1).map((row) =>
    headers.reduce<Row>((record, header, index) => {
      record[header] = normalizeCell(row[index] ?? null)
      return record
    }, {}),
  )
}
