import { describe, expect, it } from 'vitest'
import { deriveResultInsights } from './resultInsights'
import type { ModelResult } from '../../models/types'

describe('deriveResultInsights', () => {
  it('uses standard regression summary labels and significant coefficients', () => {
    const result: ModelResult = {
      id: 'linear-regression',
      summary: [
        { label: 'R-squared', value: 0.42 },
        { label: 'Prob > F', value: 0.004 },
        { label: 'Number of obs', value: 128 },
      ],
      tables: [
        {
          id: 'coefficients',
          title: 'Coefficients',
          columns: ['term', 'coefficient', 'pValue'],
          rows: [
            { term: 'x1', coefficient: 1.2, pValue: 0.03 },
            { term: 'x2', coefficient: -0.4, pValue: 0.2 },
          ],
        },
      ],
      diagnostics: [],
      message: '',
    }

    const insights = deriveResultInsights(result)

    expect(insights.some((insight) => insight.startsWith('模型解释力中等') && insight.includes('42%'))).toBe(true)
    expect(insights).toContain('整体模型检验 在 1% 水平显著（p = 0.004）。')
    expect(insights).toContain('共纳入 128 个有效观测进入估计。')
    expect(insights).toContain('1 个变量在 5% 水平显著，包括 x1。')
  })
})
