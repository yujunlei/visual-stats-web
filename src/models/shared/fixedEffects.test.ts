import { describe, expect, it } from 'vitest'
import type { Row } from '../../data/types'
import { absorbFixedEffects, formatReghdfeCommand, formatXtregCommand, nestedFixedEffectsInCluster } from './fixedEffects'

describe('fixedEffects helpers', () => {
  it('formats Stata-style command previews', () => {
    expect(formatXtregCommand('y', ['x1', 'x2'], 'id', { standardError: 'robust', clusterField: '' })).toBe('xtreg y x1 x2, fe i(id) vce(robust)')
    expect(formatReghdfeCommand('y', ['x'], ['id', 'year'], { standardError: 'cluster', clusterField: 'id' })).toBe('reghdfe y x, absorb(id year) vce(cluster id)')
  })

  it('detects fixed effects nested within a cluster field', () => {
    const rows: Row[] = [
      { id: 'a', year: 2020, city: 'north' },
      { id: 'a', year: 2021, city: 'north' },
      { id: 'b', year: 2020, city: 'south' },
      { id: 'b', year: 2021, city: 'south' },
    ]

    expect(nestedFixedEffectsInCluster(rows, ['id', 'year'], 'id')).toEqual(['id'])
    expect(nestedFixedEffectsInCluster(rows, ['year'], 'id')).toEqual([])
  })

  it('drops singleton observations when requested', () => {
    const rows: Row[] = [
      { entity: 'a', year: 2020, y: 1, x: 1 },
      { entity: 'a', year: 2021, y: 2, x: 2 },
      { entity: 'b', year: 2020, y: 3, x: 3 },
      { entity: 'b', year: 2021, y: 4, x: 4 },
      { entity: 'c', year: 2022, y: 5, x: 5 },
    ]

    const absorbed = absorbFixedEffects({
      rows,
      target: 'y',
      regressors: ['x'],
      fixedEffects: ['entity', 'year'],
      prefix: 'hdfe',
      dropSingletons: true,
    })

    expect(absorbed.observations).toBe(4)
    expect(absorbed.droppedSingletonRows).toBe(1)
    expect(absorbed.singletonDropIterations).toBe(1)
  })
})
