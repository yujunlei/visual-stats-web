import { describe, expect, it } from 'vitest'
import { buildBaselinePublicationTable, buildCustomPublicationTable } from './publicationTables'
import type { ModelResult } from '../models/types'

const result: ModelResult = {
  id: 'linear-regression',
  summary: [
    { label: 'Number of obs', value: 100 },
    { label: 'R-squared', value: 0.321 },
  ],
  tables: [
    {
      id: 'coefficients',
      title: 'Coefficients',
      columns: ['term', 'coefficient', 'stdError', 'pValue'],
      rows: [
        { term: 'x', coefficient: 1.23456, stdError: 0.12, pValue: 0.004 },
        { term: '_cons', coefficient: 0.5, stdError: 0.2, pValue: 0.02 },
      ],
    },
  ],
  diagnostics: [],
  message: '',
}

describe('publication tables', () => {
  it('builds baseline three-line publication table with core regression rows', () => {
    const table = buildBaselinePublicationTable({
      result,
      config: { target: 'y', features: ['x'] },
      dimensions: { idFields: ['id'], timeField: 'year', groupFields: [] },
      modelLabel: '线性回归',
      methodLabel: 'OLS',
    })

    expect(table?.rows.find((row) => row.role === 'model')?.values).toEqual(['OLS'])
    expect(table?.rows.find((row) => row.label === 'x')?.values).toEqual(['1.2346***'])
    expect(table?.rows.find((row) => row.label === 'id FE')?.values).toEqual(['Yes'])
    expect(table?.rows.find((row) => row.label === 'year FE')?.values).toEqual(['Yes'])
    expect(table?.rows.find((row) => row.label === 'N')?.values).toEqual(['100'])
  })

  it('uses model short names as the default custom model row labels', () => {
    const table = buildCustomPublicationTable({
      title: '自定义论文表',
      note: '',
      sources: [
        {
          id: 'current',
          result,
          config: { target: 'y', features: ['x'] },
          dimensions: { idFields: [], timeField: '', groupFields: [] },
          label: '(1)',
          modelShortName: 'OLS',
          modelName: '线性回归',
        },
      ],
    })

    expect(table?.rows.find((row) => row.role === 'model')?.values).toEqual(['OLS'])
    expect(table?.rows.find((row) => row.label === 'x')?.values).toEqual(['1.2346***'])
  })

  it('normalizes unsafe custom format rules before formatting the table', () => {
    const table = buildCustomPublicationTable({
      title: '自定义论文表',
      note: '',
      sources: [
        {
          id: 'current',
          result,
          config: { target: 'y', features: ['x'] },
          dimensions: { idFields: [], timeField: '', groupFields: [] },
          label: '(1)',
          modelShortName: 'OLS',
        },
      ],
      formatRules: {
        coefficientDigits: 99,
        statisticDigits: Number.NaN,
        nDigits: -5,
        r2Digits: 9,
        parenthesisMode: 't',
        starLevels: { one: 2, two: 0.05, three: 0.01 },
        missingDisplay: '',
        booleanDisplay: 'yes-no',
      },
    })

    expect(table?.rows.find((row) => row.label === 'x')?.values).toEqual(['1.23456000***'])
    expect(table?.rows.find((row) => row.label === '')?.values[0]).toBe('(10.29)')
    expect(table?.rows.find((row) => row.label === 'N')?.values).toEqual(['100'])
    expect(table?.rows.find((row) => row.label === 'Adj-R²')?.values).toEqual(['0.321000'])
  })

  it('does not append coefficient terms when visible variables are explicitly empty', () => {
    const table = buildCustomPublicationTable({
      title: '自定义论文表',
      note: '',
      sources: [
        {
          id: 'current',
          result,
          config: { target: 'y', features: ['x'] },
          dimensions: { idFields: [], timeField: '', groupFields: [] },
          label: '(1)',
          modelShortName: 'OLS',
        },
      ],
      visibleVariableIds: [],
      enabledStatisticIds: ['n'],
    })

    expect(table?.rows.some((row) => row.role === 'coefficient')).toBe(false)
    expect(table?.rows.some((row) => row.role === 'statistic')).toBe(false)
    expect(table?.rows.find((row) => row.label === 'N')?.values).toEqual(['100'])
  })

  it('keeps legacy auto-derived coefficient terms when visible variables are not provided', () => {
    const table = buildCustomPublicationTable({
      title: '自定义论文表',
      note: '',
      sources: [
        {
          id: 'current',
          result,
          config: { target: 'y', features: ['x'] },
          dimensions: { idFields: [], timeField: '', groupFields: [] },
          label: '(1)',
          modelShortName: 'OLS',
        },
      ],
      variableOrder: [],
      enabledStatisticIds: [],
    })

    expect(table?.rows.filter((row) => row.role === 'coefficient').map((row) => row.label)).toEqual(['x', 'Cons'])
  })
})
