import type { Row } from './types'

export type MissingValueAlert = {
  fileName: string
  rows: Row[]
  missingCells: number
  affectedRows: number
  fields: Array<{ name: string; missing: number }>
}

export const isMissingCell = (value: Row[string] | undefined) => value === null || value === undefined || value === ''

export const summarizeMissingValues = (rows: Row[], fileName: string): MissingValueAlert | null => {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const fieldCounts = new Map<string, number>()
  let missingCells = 0
  let affectedRows = 0

  rows.forEach((row) => {
    let rowHasMissing = false

    fields.forEach((field) => {
      if (!isMissingCell(row[field])) return

      rowHasMissing = true
      missingCells += 1
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1)
    })

    if (rowHasMissing) affectedRows += 1
  })

  if (missingCells === 0) return null

  return {
    fileName,
    rows,
    missingCells,
    affectedRows,
    fields: [...fieldCounts.entries()]
      .map(([name, missing]) => ({ name, missing }))
      .sort((left, right) => right.missing - left.missing || left.name.localeCompare(right.name)),
  }
}
