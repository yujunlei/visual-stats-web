import { describe, expect, it } from 'vitest'
import { emptyDataRoles } from '../data/dataRoles'
import { normalizeWorkbenchSnapshot } from '../data/snapshots'
import { defaultCustomPublicationConfig } from '../export/customPublicationConfig'
import type { ModelResult } from './types'
import {
  buildModelComparisonSources,
  buildModelComparisonTable,
  createCustomPublicationConfigFromComparison,
  modelComparisonSourcesToCustomPublicationSources,
} from './modelComparison'

const result = (id: string, rSquared: number, coefficient: number): ModelResult => ({
  id,
  summary: [
    { label: 'Number of obs', value: 120 },
    { label: 'R-squared', value: rSquared },
  ],
  tables: [
    {
      id: 'coefficients',
      title: '系数估计',
      columns: ['term', 'coefficient', 'stdError', 'pValue'],
      rows: [
        { term: 'x', coefficient, stdError: 0.1, pValue: 0.04 },
        { term: '_cons', coefficient: 1, stdError: 0.2, pValue: 0.2 },
      ],
    },
  ],
  diagnostics: [],
  message: 'ok',
})

describe('modelComparison', () => {
  it('collects current and snapshot result sources without re-estimating', () => {
    const snapshot = normalizeWorkbenchSnapshot({
      id: 's1',
      label: '历史 OLS',
      createdAt: '2026-01-01T00:00:00.000Z',
      fileName: 'demo.xlsx',
      modelId: 'ols',
      modelName: '线性回归',
      modelShortName: 'OLS',
      formula: 'y ~ x + z',
      modelConfig: { target: 'y', features: ['x', 'z'], params: {} },
      result: result('ols', 0.72, 0.4),
      savedResultAt: '2026-01-02T00:00:00.000Z',
    })

    const sources = buildModelComparisonSources({
      current: {
        result: result('ols-current', 0.8, 0.5),
        modelId: 'ols',
        modelName: '线性回归',
        modelShortName: 'OLS',
        formula: 'y ~ x',
        modelConfig: { target: 'y', features: ['x'], params: {} },
        dataRoles: emptyDataRoles,
        createdAt: '2026-01-03T00:00:00.000Z',
      },
      snapshots: [snapshot],
    })

    expect(sources.map((source) => source.id)).toEqual(['current', 'snapshot:s1'])
    expect(sources[1].result).toBe(snapshot.result)
  })

  it('builds a horizontal comparison table from metrics and coefficients', () => {
    const sources = buildModelComparisonSources({
      current: {
        result: result('ols-current', 0.8, 0.5),
        modelId: 'ols',
        modelName: '线性回归',
        modelShortName: 'OLS',
        formula: 'y ~ x',
        modelConfig: { target: 'y', features: ['x'], params: {} },
        dataRoles: emptyDataRoles,
      },
      snapshots: [
        normalizeWorkbenchSnapshot({
          id: 's1',
          label: '历史 OLS',
          createdAt: '2026-01-01T00:00:00.000Z',
          modelId: 'ols',
          modelName: '线性回归',
          formula: 'y ~ x',
          modelConfig: { target: 'y', features: ['x'], params: {} },
          result: result('ols-snapshot', 0.7, 0.3),
        }),
      ],
    })

    const table = buildModelComparisonTable(sources)

    expect(table?.columns.map((column) => column.id)).toEqual(['current', 'snapshot:s1'])
    expect(table?.rows.find((row) => row.id === 'metric:R-squared')?.values).toEqual([0.8, 0.7])
    expect(table?.rows.find((row) => row.id === 'coefficient:x')?.values).toEqual(['0.5000**', '0.3000**'])
    expect(table?.rows.find((row) => row.id === 'formula')?.values).toEqual(['y ~ x', 'y ~ x'])
  })

  it('creates custom publication table inputs from selected comparison sources', () => {
    const sources = buildModelComparisonSources({
      current: {
        result: result('ols-current', 0.8, 0.5),
        modelId: 'ols',
        modelName: '线性回归',
        modelShortName: 'OLS',
        formula: 'y ~ x',
        modelConfig: { target: 'y', features: ['x'], params: {} },
        dataRoles: emptyDataRoles,
      },
      snapshots: [],
    })

    const config = createCustomPublicationConfigFromComparison(defaultCustomPublicationConfig(), sources, ['current'])
    const publicationSources = modelComparisonSourcesToCustomPublicationSources(sources)

    expect(config).toMatchObject({
      mode: 'custom',
      selectedSourceIds: ['current'],
      columnOrder: ['current'],
      columns: {
        current: {
          label: '(1)',
          group: '当前结果',
          modelLabel: 'OLS',
        },
      },
    })
    expect(publicationSources[0]).toMatchObject({ id: 'current', modelShortName: 'OLS', formula: 'y ~ x' })
  })
})
