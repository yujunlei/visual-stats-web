import { describe, expect, it } from 'vitest'
import type { Row } from '../../data/types'
import type { ModelConfig } from '../types'
import { makeSpatialRows, safeSpatialName } from './spatialContext'

describe('spatialContext', () => {
  const rows: Row[] = [
    { region: 1, y: 10, x: 1 },
    { region: 2, y: 14, x: 2 },
    { region: 3, y: 18, x: 3 },
    { region: 4, y: 22, x: 4 },
  ]

  it('builds sorted-neighbor lags without changing source rows', () => {
    const config: ModelConfig = {
      target: 'y',
      features: ['region', 'x'],
      params: { target: 'y', spatialKey: 'region', controls: ['x'] },
    }
    const spatial = makeSpatialRows(rows, config, 'sar')

    expect(spatial.context.mode).toBe('sorted')
    expect(spatial.context.validWeights).toBe(4)
    expect(spatial.wy).toBe(safeSpatialName('W', 'y'))
    expect(spatial.regressors).toEqual([safeSpatialName('W', 'y'), 'x'])
    expect(rows[0]).not.toHaveProperty(spatial.wy)
    expect(spatial.rows[1][spatial.wy]).toBe(14)
  })

  it('uses explicit edge-list weights when neighbor and weight fields are configured', () => {
    const edgeRows: Row[] = [
      { region: 'A', neighbor: 'B', weight: 1, y: 10, x: 1 },
      { region: 'B', neighbor: 'A', weight: 1, y: 20, x: 2 },
      { region: 'C', neighbor: 'B', weight: 2, y: 30, x: 3 },
      { region: 'D', neighbor: 'C', weight: 1, y: 40, x: 4 },
    ]
    const config: ModelConfig = {
      target: 'y',
      features: ['region', 'neighbor', 'weight', 'x'],
      params: { target: 'y', spatialKey: 'region', neighborKey: 'neighbor', weightField: 'weight', controls: ['x'] },
    }
    const spatial = makeSpatialRows(edgeRows, config, 'slx')

    expect(spatial.context.mode).toBe('edge-list')
    expect(spatial.context.validWeights).toBe(4)
    expect(spatial.wx).toEqual([safeSpatialName('W', 'x')])
    expect(spatial.regressors).toEqual(['x', safeSpatialName('W', 'x')])
  })
})
