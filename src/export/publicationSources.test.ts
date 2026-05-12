import { describe, expect, it } from 'vitest'
import { emptyDataRoles } from '../data/dataRoles'
import type { ModelResult } from '../models/types'
import { buildPublicationSources, hasCoefficientPublicationSource } from './publicationSources'

const resultWithCoefficients: ModelResult = {
  id: 'linear-regression',
  summary: [],
  tables: [
    {
      id: 'coefficients',
      title: '系数估计',
      columns: ['term', 'coefficient'],
      rows: [{ term: 'x', coefficient: 1 }],
    },
  ],
  diagnostics: [],
  message: '',
}

const resultWithoutCoefficients: ModelResult = {
  id: 'frequency-analysis',
  summary: [],
  tables: [{ id: 'frequency', title: '频数', columns: ['value'], rows: [{ value: 'A' }] }],
  diagnostics: [],
  message: '',
}

describe('publication sources', () => {
  it('builds the current result source with model short name', () => {
    const sources = buildPublicationSources({
      current: {
        result: resultWithCoefficients,
        config: { target: 'y', features: ['x'], params: {} },
        dimensions: emptyDataRoles,
        modelName: '线性回归',
        modelShortName: 'OLS',
        formula: 'y ~ x',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      snapshots: [],
      getModelShortName: () => '',
    })

    expect(sources).toMatchObject([
      {
        id: 'current',
        label: '当前结果 · 线性回归',
        modelName: '线性回归',
        modelShortName: 'OLS',
        formula: 'y ~ x',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    expect(hasCoefficientPublicationSource(sources)).toBe(true)
  })

  it('builds snapshot sources and falls back to registry short names', () => {
    const sources = buildPublicationSources({
      snapshots: [
        {
          id: 's1',
          label: 'Snapshot 1',
          modelId: 'linear-regression',
          modelName: '线性回归',
          formula: 'y ~ x',
          modelConfig: { target: 'y', features: ['x'], params: {} },
          result: resultWithCoefficients,
          createdAt: '2026-01-01T00:00:00.000Z',
          savedResultAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 's2',
          label: 'No result',
          modelId: 'frequency-analysis',
          modelName: '频数',
          formula: 'tabulate x',
          modelConfig: { target: '', features: ['x'], params: {} },
          createdAt: '2026-01-03T00:00:00.000Z',
        },
      ],
      getModelShortName: () => 'OLS',
    })

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      id: 'snapshot:s1',
      modelShortName: 'OLS',
      createdAt: '2026-01-02T00:00:00.000Z',
      dimensions: emptyDataRoles,
    })
  })

  it('detects whether any source can produce a coefficient publication table', () => {
    const sources = buildPublicationSources({
      snapshots: [
        {
          id: 's1',
          label: 'Frequency',
          modelId: 'frequency-analysis',
          modelName: '频数',
          formula: 'tabulate x',
          modelConfig: { target: '', features: ['x'], params: {} },
          result: resultWithoutCoefficients,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      getModelShortName: () => 'FREQ',
    })

    expect(hasCoefficientPublicationSource(sources)).toBe(false)
  })
})
