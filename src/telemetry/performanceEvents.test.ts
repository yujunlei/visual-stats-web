import { describe, expect, it } from 'vitest'
import { clearPerformanceEvents, getPerformanceEvents, recordPerformanceEvent } from './performanceEvents'

describe('performanceEvents', () => {
  it('records bounded frontend performance events', () => {
    clearPerformanceEvents()
    recordPerformanceEvent('import.started', undefined, { file: 'demo.csv' })
    recordPerformanceEvent('import.completed', 12.4, { rows: 10 })

    expect(getPerformanceEvents()).toMatchObject([
      { name: 'import.started', metadata: { file: 'demo.csv' } },
      { name: 'import.completed', durationMs: 12, metadata: { rows: 10 } },
    ])
  })
})
