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

export const profileRows = (rows: Row[], overrides: TypeOverrides = {}): VariableProfile[] => {
  const columns = Object.keys(rows[0] ?? {})

  return columns.map((name) => {
    const uniqueValues = new Set<Row[string]>()
    let missing = 0
    let nonMissing = 0
    let numericCount = 0
    let dateLikeCount = 0
    let min: number | undefined
    let max: number | undefined

    for (const row of rows) {
      const value = row[name]

      if (value === null || value === '') {
        missing += 1
      } else {
        nonMissing += 1
        uniqueValues.add(value)
        if (isDateLike(value)) dateLikeCount += 1
      }

      const numericValue = toNumber(value)
      if (numericValue !== null) {
        numericCount += 1
        min = min === undefined ? numericValue : Math.min(min, numericValue)
        max = max === undefined ? numericValue : Math.max(max, numericValue)
      }
    }

    const inferredType: ColumnType =
      rows.length === missing
        ? 'empty'
        : numericCount >= rows.length - missing
          ? 'numeric'
          : nonMissing > 0 && dateLikeCount >= nonMissing * 0.8
            ? 'date'
            : 'category'
    const type = overrides[name] ?? inferredType

    return {
      name,
      type,
      inferredType,
      missing,
      unique: uniqueValues.size,
      min,
      max,
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
