import { describe, expect, it } from 'vitest'
import type { ModelConfig, SpatialWeightsParam } from '../types'
import { formatSpatialTerm, getSpatialFormula, makeDefaultSpatialConfig, sanitizeSpatialConfig, spatialMlFeatures, spatialSpecs } from './spatialPluginConfig'

describe('spatialPluginConfig', () => {
  it('keeps default panel SDM config field selection stable', () => {
    const config = makeDefaultSpatialConfig(['region', 'panel', 'x1', 'x2'], ['y', 'x1', 'x2'], 'panel-sdm')

    expect(config).toEqual({
      target: 'y',
      features: ['region', 'panel', 'x1', 'x2'],
      params: {
        target: 'y',
        spatialKey: 'region',
        neighborKey: '',
        weightField: '',
        spatialWeights: '',
        controls: ['x1', 'x2'],
        panelId: 'panel',
        timeField: '',
      },
    })
  })

  it('sanitizes spatial config without changing structural field semantics', () => {
    const weights: SpatialWeightsParam = {
      kind: 'spatial-weights',
      fileName: 'w.csv',
      format: 'edge-list',
      edges: [{ from: 'A', to: 'B', weight: 1 }],
      summary: '1 edge',
    }
    const dirtyConfig: ModelConfig = {
      target: 'missing',
      features: ['old_region', 'region', 'neighbor', 'weight', 'panel', 'time', 'x1', 'x2', 'extra'],
      params: {
        target: 'missing',
        spatialKey: 'region',
        neighborKey: 'neighbor',
        weightField: 'weight',
        spatialWeights: weights,
        controls: ['region', 'neighbor', 'weight', 'panel', 'time', 'x1', 'x2', 'extra'],
        panelId: 'panel',
        timeField: 'time',
      },
    }

    const sanitized = sanitizeSpatialConfig(dirtyConfig, ['region', 'neighbor', 'weight', 'panel', 'time', 'x1', 'x2'], ['y', 'x1', 'x2'], 'panel-sdm')

    expect(sanitized).toEqual({
      target: 'y',
      features: ['region', 'neighbor', 'weight', 'panel', 'time', 'x1', 'x2'],
      params: {
        target: 'y',
        spatialKey: 'region',
        neighborKey: 'neighbor',
        weightField: 'weight',
        spatialWeights: weights,
        controls: ['x1', 'x2'],
        panelId: 'panel',
        timeField: 'time',
      },
    })
  })

  it('keeps formula, term formatting, and ML feature routing stable', () => {
    const config: ModelConfig = {
      target: 'y',
      features: ['region', 'x1', 'x2'],
      params: { target: 'y', spatialKey: 'region', controls: ['x1', 'x2'], panelId: 'firm', timeField: 'year' },
    }

    expect(spatialSpecs.map((spec) => spec.id)).toEqual([
      'spatial-sar',
      'spatial-slx',
      'spatial-sdm',
      'spatial-sem',
      'spatial-sdem',
      'spatial-sac',
      'spatial-gns',
      'spatial-panel-sdm',
      'spatial-logit',
    ])
    expect(getSpatialFormula('panel-sdm', config)).toBe('y = rho*Wy + x1 + x2 + theta*WX + FE(firm, year)')
    expect(formatSpatialTerm('W_y', config)).toBe('W_y')
    expect(formatSpatialTerm('W_e_y', config)).toBe('W_residual')
    expect(spatialMlFeatures('sdm', ['x1', 'x2'], ['W_x1', 'W_x2'])).toEqual(['x1', 'x2', 'W_x1', 'W_x2'])
    expect(spatialMlFeatures('slx', ['x1'], ['W_x1'])).toBeUndefined()
  })
})
