import { describe, expect, it } from 'vitest'
import { profileRows } from './tableUtils'
import type { Row } from './types'

describe('profileRows', () => {
  it('profiles numeric, date, category, and empty columns without changing output semantics', () => {
    const rows: Row[] = [
      { id: 1, day: '2026-05-01', group: 'A', empty: null },
      { id: '2', day: '2026/05/02', group: 'B', empty: '' },
      { id: '3,000', day: 'not-a-date', group: 'A', empty: null },
      { id: null, day: '2026-05-04', group: '', empty: '' },
      { id: 5, day: '2026-05-05', group: 'C', empty: null },
    ]

    expect(profileRows(rows)).toEqual([
      { name: 'id', type: 'numeric', inferredType: 'numeric', missing: 1, unique: 4, min: 1, max: 3000 },
      { name: 'day', type: 'date', inferredType: 'date', missing: 0, unique: 5, min: undefined, max: undefined },
      { name: 'group', type: 'category', inferredType: 'category', missing: 1, unique: 3, min: undefined, max: undefined },
      { name: 'empty', type: 'empty', inferredType: 'empty', missing: 5, unique: 0, min: undefined, max: undefined },
    ])
  })

  it('keeps explicit type overrides separate from inferred types', () => {
    expect(profileRows([{ year: 2026 }], { year: 'category' })).toEqual([
      { name: 'year', type: 'category', inferredType: 'numeric', missing: 0, unique: 1, min: 2026, max: 2026 },
    ])
  })
})
