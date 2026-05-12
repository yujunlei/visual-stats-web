import { describe, expect, it } from 'vitest'
import { emptyDataRoles } from '../data/dataRoles'
import type { CustomPublicationSource } from './publicationTables'
import {
  getCustomPublicationStatisticOptions,
  getCustomPublicationVariableOptions,
  orderCustomPublicationOptions,
  resolveSelectedPublicationSources,
} from './customPublicationOptions'

const makeSource = (id: string, terms: string[], dimensions = emptyDataRoles): CustomPublicationSource => ({
  id,
  label: id,
  modelName: '线性回归',
  modelShortName: 'OLS',
  formula: 'y ~ x',
  config: { target: 'y', features: ['x'], params: {} },
  dimensions,
  result: {
    id: 'linear-regression',
    summary: [],
    tables: [
      {
        id: 'coefficients',
        title: '系数估计',
        columns: ['term', 'coefficient'],
        rows: terms.map((term, index) => ({ term, coefficient: index + 1 })),
      },
    ],
    diagnostics: [],
    message: '',
  },
})

describe('custom publication options', () => {
  it('resolves selected sources in column order', () => {
    const sources = [makeSource('current', ['x']), makeSource('snapshot:1', ['z']), makeSource('snapshot:2', ['w'])]

    expect(resolveSelectedPublicationSources(sources, new Set(['current', 'snapshot:1']), ['snapshot:1']).map((source) => source.id)).toEqual([
      'snapshot:1',
      'current',
    ])
  })

  it('collects coefficient variable options with labels and Cons alias', () => {
    const options = getCustomPublicationVariableOptions([makeSource('current', ['_cons', 'x'])], { x: '核心变量' })

    expect(options).toEqual([
      { id: '_cons', label: 'Cons' },
      { id: 'x', label: '核心变量' },
    ])
  })

  it('orders options while preserving newly available entries', () => {
    expect(orderCustomPublicationOptions([{ id: 'x', label: 'X' }, { id: 'z', label: 'Z' }], ['z'])).toEqual([
      { id: 'z', label: 'Z' },
      { id: 'x', label: 'X' },
    ])
  })

  it('builds statistic options from dimensions and labels', () => {
    const source = makeSource('current', ['x'], {
      idFields: ['id'],
      timeField: 'year',
      groupFields: ['city'],
    })

    const options = getCustomPublicationStatisticOptions(
      [source],
      {
        controls: '控制变量',
        'fe:year FE': 'Year FE',
      },
      ['n', 'controls'],
    )

    expect(options.map((option) => option.id)).toEqual(['n', 'controls', 'fe:city FE', 'fe:id FE', 'fe:year FE', 'adj-r2'])
    expect(options.find((option) => option.id === 'controls')?.label).toBe('控制变量')
    expect(options.find((option) => option.id === 'fe:year FE')?.label).toBe('Year FE')
  })
})
