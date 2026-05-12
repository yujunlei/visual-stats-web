import { describe, expect, it } from 'vitest'
import type { Row } from '../../data/types'
import { categorySummaryPlugin, crosstabChiSquarePlugin, frequencyAnalysisPlugin, nonparametricTestPlugin, varianceAnalysisPlugin } from './commonMethods'

const numericMetric = (rows: Array<{ label: string; value: string | number }>, label: string) => {
  const value = rows.find((entry) => entry.label === label)?.value
  if (typeof value !== 'number') throw new Error(`Missing numeric metric: ${label}`)
  return value
}

describe('common method plugins', () => {
  it('keeps frequency rows, summary, and CSV output stable', () => {
    const rows: Row[] = [{ segment: 'A' }, { segment: 'B' }, { segment: 'A' }, { segment: '' }, { segment: null }, { segment: 'C' }, { segment: 'A' }]
    const config = { target: '', features: ['segment'], params: { variable: 'segment' } }

    const result = frequencyAnalysisPlugin.fit({ rows, config })

    expect(result.summary).toEqual([
      { label: 'rows', value: 7 },
      { label: 'valid', value: 5 },
      { label: 'missing', value: 2 },
      { label: 'categories', value: 3 },
    ])
    expect(result.tables[0].rows).toEqual([
      { value: 'A', count: 3, percent: 0.6, cumulativePercent: 0.6 },
      { value: 'B', count: 1, percent: 0.2, cumulativePercent: 0.8 },
      { value: 'C', count: 1, percent: 0.2, cumulativePercent: 1 },
    ])
    expect(frequencyAnalysisPlugin.exportCsv(result, config)).toBe(
      ['模型摘要', '字段,值', 'Model,tabulate segment', 'rows,7', 'valid,5', 'missing,2', 'categories,3', '', '频数表', 'value,count,percent,cumulativePercent', 'A,3,0.6,0.6', 'B,1,0.2,0.8', 'C,1,0.2,1'].join('\n'),
    )
  })

  it('keeps grouped summary statistics stable', () => {
    const rows: Row[] = [
      { group: 'A', score: 1 },
      { group: 'A', score: 3 },
      { group: 'A', score: 5 },
      { group: 'B', score: 2 },
      { group: 'B', score: 4 },
      { group: 'B', score: 'missing' },
    ]

    const result = categorySummaryPlugin.fit({ rows, config: { target: '', features: ['group', 'score'], params: { group: 'group', variable: 'score' } } })

    expect(result.summary).toEqual([
      { label: 'groups', value: 2 },
      { label: 'valid', value: 5 },
      { label: 'variable', value: 'score' },
      { label: 'group field', value: 'group' },
    ])
    expect(result.tables[0].rows).toEqual([
      { group: 'A', n: 3, mean: 3, median: 3, stdDev: 2, min: 1, max: 5 },
      { group: 'B', n: 2, mean: 3, median: 3, stdDev: Math.sqrt(2), min: 2, max: 4 },
    ])
  })

  it('keeps crosstab chi-square counts and statistic stable', () => {
    const rows: Row[] = [
      ...Array.from({ length: 8 }, () => ({ group: 'A', outcome: 'Yes' })),
      ...Array.from({ length: 2 }, () => ({ group: 'A', outcome: 'No' })),
      ...Array.from({ length: 1 }, () => ({ group: 'B', outcome: 'Yes' })),
      ...Array.from({ length: 9 }, () => ({ group: 'B', outcome: 'No' })),
    ]

    const result = crosstabChiSquarePlugin.fit({ rows, config: { target: '', features: ['group', 'outcome'], params: { rowVar: 'group', colVar: 'outcome' } } })

    expect(numericMetric(result.summary, 'N')).toBe(20)
    expect(numericMetric(result.summary, 'Chi-square')).toBeCloseTo(9.8989898989899, 10)
    expect(numericMetric(result.summary, 'df')).toBe(1)
    expect(result.tables[0].columns).toEqual(['rowCategory', 'No', 'Yes', 'rowTotal'])
    expect(result.tables[0].rows).toEqual([
      { rowCategory: 'A', No: 2, Yes: 8, rowTotal: 10 },
      { rowCategory: 'B', No: 9, Yes: 1, rowTotal: 10 },
    ])
  })

  it('keeps variance and nonparametric grouped outputs stable', () => {
    const rows: Row[] = [
      { group: 'A', score: 1 },
      { group: 'A', score: 2 },
      { group: 'A', score: 3 },
      { group: 'B', score: 4 },
      { group: 'B', score: 5 },
      { group: 'B', score: 6 },
    ]

    const varianceResult = varianceAnalysisPlugin.fit({ rows, config: { target: '', features: ['score', 'group'], params: { variable: 'score', group: 'group' } } })
    const rankResult = nonparametricTestPlugin.fit({ rows, config: { target: '', features: ['group', 'score'], params: { group: 'group', variable: 'score' } } })

    expect(varianceResult.tables[0].rows).toEqual([
      { group: 'A', n: 3, variance: 1, stdDev: 1, range: 2, iqr: 1 },
      { group: 'B', n: 3, variance: 1, stdDev: 1, range: 2, iqr: 1 },
    ])
    expect(rankResult.tables[0].rows).toEqual([
      { group: 'A', n: 3, median: 2, rankSum: 6, meanRank: 2 },
      { group: 'B', n: 3, median: 5, rankSum: 15, meanRank: 5 },
    ])
    expect(rankResult.tables[1].rows[0].statistic).toBe(0)
  })
})
