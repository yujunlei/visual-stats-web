import { describe, expect, it } from 'vitest'
import { isMissingCell, summarizeMissingValues } from './missingValues'

describe('missing value helpers', () => {
  it('detects nullish and empty-string cells only', () => {
    expect(isMissingCell(null)).toBe(true)
    expect(isMissingCell(undefined)).toBe(true)
    expect(isMissingCell('')).toBe(true)
    expect(isMissingCell(0)).toBe(false)
    expect(isMissingCell('0')).toBe(false)
  })

  it('summarizes missing cells by affected row and field', () => {
    const rows = [
      { id: 1, y: 2, x: '' },
      { id: 2, y: null, x: '' },
      { id: 3, y: 4, x: 5 },
    ]

    expect(summarizeMissingValues(rows, 'fixture.csv')).toEqual({
      fileName: 'fixture.csv',
      rows,
      missingCells: 3,
      affectedRows: 2,
      fields: [
        { name: 'x', missing: 2 },
        { name: 'y', missing: 1 },
      ],
    })
  })

  it('returns null when no missing values are present', () => {
    expect(summarizeMissingValues([{ id: 1, y: 2 }], 'clean.csv')).toBeNull()
  })
})
