import { describe, expect, it } from 'vitest'
import { diagnosePanelBalance } from './panelBalance'

describe('panel balance diagnosis', () => {
  it('returns not-configured when ID or time roles are missing', () => {
    const diagnosis = diagnosePanelBalance([{ id: 1, year: 2020 }], { idFields: [], timeField: '', groupFields: [] })

    expect(diagnosis.status).toBe('not-configured')
    expect(diagnosis.actualObservations).toBe(1)
  })

  it('detects a balanced panel', () => {
    const rows = [
      { id: 'A', year: 2020 },
      { id: 'A', year: 2021 },
      { id: 'B', year: 2020 },
      { id: 'B', year: 2021 },
    ]

    const diagnosis = diagnosePanelBalance(rows, { idFields: ['id'], timeField: 'year', groupFields: [] })

    expect(diagnosis.status).toBe('balanced')
    expect(diagnosis.idCount).toBe(2)
    expect(diagnosis.timeCount).toBe(2)
    expect(diagnosis.expectedObservations).toBe(4)
    expect(diagnosis.duplicateCombinations).toBe(0)
    expect(diagnosis.missingCombinations).toBe(0)
  })

  it('reports missing, duplicate, and invalid panel rows', () => {
    const rows = [
      { id: 'A', year: 2020 },
      { id: 'A', year: 2020 },
      { id: 'A', year: 2021 },
      { id: 'B', year: 2020 },
      { id: '', year: 2020 },
      { id: 'C', year: '' },
    ]

    const diagnosis = diagnosePanelBalance(rows, { idFields: ['id'], timeField: 'year', groupFields: [] })

    expect(diagnosis.status).toBe('unbalanced')
    expect(diagnosis.missingIdRows).toBe(1)
    expect(diagnosis.missingTimeRows).toBe(1)
    expect(diagnosis.duplicateCombinations).toBe(1)
    expect(diagnosis.missingCombinations).toBe(1)
    expect(diagnosis.examples.length).toBeGreaterThan(0)
  })
})
