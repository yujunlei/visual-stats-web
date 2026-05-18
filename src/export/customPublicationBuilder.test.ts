import { describe, expect, it } from 'vitest'
import { defaultCustomPublicationConfig } from './customPublicationConfig'
import { buildCustomPublicationTableFromConfig } from './customPublicationBuilder'
import type { CustomPublicationSource, PublicationTable } from './publicationTables'
import type { ModelResult } from '../models/types'
import { emptyDataRoles } from '../data/dataRoles'

const result: ModelResult = {
  id: 'linear-regression',
  summary: [
    { label: 'Number of obs', value: 100 },
    { label: 'Adj R-squared', value: 0.42 },
  ],
  tables: [
    {
      id: 'coefficients',
      title: '系数估计',
      columns: ['term', 'coefficient', 't', 'pValue'],
      rows: [
        { term: 'x', coefficient: 1.234, t: 2.5, pValue: 0.02 },
        { term: '_cons', coefficient: 0.5, t: 1.1, pValue: 0.3 },
      ],
    },
  ],
  diagnostics: [],
  message: '',
}

const source: CustomPublicationSource = {
  id: 'current',
  label: 'Current',
  modelName: '线性回归',
  modelShortName: 'OLS',
  result,
  config: { target: 'y', features: ['x'], params: {} },
  dimensions: emptyDataRoles,
}

describe('custom publication builder', () => {
  it('returns the baseline table in default table mode', () => {
    const baseline: PublicationTable = {
      kind: 'baseline',
      title: 'Baseline',
      sheetName: 'Baseline',
      columns: [],
      rows: [],
      notes: [],
      merges: [],
    }

    expect(
      buildCustomPublicationTableFromConfig({
        config: defaultCustomPublicationConfig(),
        isDefaultTableMode: true,
        baselineTable: baseline,
        selectedSources: [source],
        orderedVariableOptions: [],
        statisticOptions: [],
        hiddenVariableIds: new Set(),
        disabledStatisticIds: new Set(),
      }),
    ).toBe(baseline)
  })

  it('builds a custom table with visible variables and enabled statistics only', () => {
    const config = {
      ...defaultCustomPublicationConfig(),
      mode: 'custom' as const,
      title: 'Custom Table',
      columns: {
        current: {
          id: 'current',
          label: '(A)',
          group: 'Baseline',
          modelLabel: '',
        },
      },
    }

    const table = buildCustomPublicationTableFromConfig({
      config,
      isDefaultTableMode: false,
      baselineTable: null,
      selectedSources: [source],
      orderedVariableOptions: [
        { id: 'x', label: 'X' },
        { id: '_cons', label: 'Cons' },
      ],
      statisticOptions: [
        { id: 'n', label: 'N', detail: '样本量' },
        { id: 'adj-r2', label: 'Adj-R²', detail: '调整 R²' },
      ],
      hiddenVariableIds: new Set(['_cons']),
      disabledStatisticIds: new Set(['adj-r2']),
    })

    expect(table).not.toBeNull()
    if (!table) return
    expect(table.title).toBe('Custom Table')
    expect(table.columns).toEqual([{ id: 'current', label: '(A)', group: 'Baseline' }])
    expect(table.rows.some((row) => row.role === 'coefficient' && row.label === 'x')).toBe(true)
    expect(table.rows.some((row) => row.role === 'coefficient' && row.label === 'Cons')).toBe(false)
    expect(table.rows.some((row) => row.role === 'metric' && row.label === 'N')).toBe(true)
    expect(table.rows.some((row) => row.role === 'metric' && row.label === 'Adj-R²')).toBe(false)
  })

  it('does not auto-fill coefficient rows when every variable is hidden', () => {
    const table = buildCustomPublicationTableFromConfig({
      config: {
        ...defaultCustomPublicationConfig(),
        mode: 'custom' as const,
      },
      isDefaultTableMode: false,
      baselineTable: null,
      selectedSources: [source],
      orderedVariableOptions: [
        { id: 'x', label: 'X' },
        { id: '_cons', label: 'Cons' },
      ],
      statisticOptions: [
        { id: 'n', label: 'N', detail: '样本量' },
      ],
      hiddenVariableIds: new Set(['x', '_cons']),
      disabledStatisticIds: new Set(),
    })

    expect(table).not.toBeNull()
    if (!table) return
    expect(table.rows.some((row) => row.role === 'coefficient')).toBe(false)
    expect(table.rows.some((row) => row.role === 'statistic')).toBe(false)
    expect(table.rows.some((row) => row.role === 'metric' && row.label === 'N')).toBe(true)
  })

  it('does not auto-fill hidden coefficient terms when only one variable is visible', () => {
    const table = buildCustomPublicationTableFromConfig({
      config: {
        ...defaultCustomPublicationConfig(),
        mode: 'custom' as const,
      },
      isDefaultTableMode: false,
      baselineTable: null,
      selectedSources: [source],
      orderedVariableOptions: [
        { id: 'x', label: 'X' },
        { id: '_cons', label: 'Cons' },
      ],
      statisticOptions: [],
      hiddenVariableIds: new Set(['_cons']),
      disabledStatisticIds: new Set(),
    })

    expect(table).not.toBeNull()
    if (!table) return
    expect(table.rows.filter((row) => row.role === 'coefficient').map((row) => row.label)).toEqual(['x'])
  })

  it('keeps custom statistic rows in the UI order', () => {
    const table = buildCustomPublicationTableFromConfig({
      config: {
        ...defaultCustomPublicationConfig(),
        mode: 'custom' as const,
      },
      isDefaultTableMode: false,
      baselineTable: null,
      selectedSources: [
        {
          ...source,
          dimensions: { idFields: ['id'], timeField: 'year', groupFields: [] },
        },
      ],
      orderedVariableOptions: [{ id: 'x', label: 'X' }],
      statisticOptions: [
        { id: 'adj-r2', label: 'Adj-R²', detail: '调整 R²' },
        { id: 'n', label: 'N', detail: '样本量' },
        { id: 'fe:year FE', label: 'year FE', detail: '固定效应统计行' },
        { id: 'controls', label: 'Controls', detail: '控制变量行' },
      ],
      hiddenVariableIds: new Set(),
      disabledStatisticIds: new Set(),
    })

    expect(table).not.toBeNull()
    if (!table) return
    expect(table.rows.filter((row) => row.role === 'metric' || row.role === 'fixedEffect').map((row) => row.label)).toEqual(['Adj-R²', 'N', 'year FE', 'Controls'])
  })
})
