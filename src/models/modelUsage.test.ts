import { describe, expect, it } from 'vitest'
import { filterAndSortModelPlugins, getRecentModelPlugins, recordModelUsage } from './modelUsage'
import type { ModelPlugin } from './types'

const makePlugin = (id: string, name: string, group: string, keywords: string[] = []): ModelPlugin => ({
  id,
  name,
  nodeLabel: name,
  panelLabel: name,
  resultLabel: '结果',
  description: `${name} description`,
  methodLabel: id.toUpperCase(),
  shortName: id.toUpperCase(),
  fullName: `${name} full`,
  category: group,
  keywords,
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '',
  downloadName: `${id}.csv`,
  supportsCategoricalFeatures: true,
  getDefaultConfig: () => ({ target: '', features: [], params: {} }),
  sanitizeConfig: (config) => config,
  getFormula: () => id,
  getSettings: () => [],
  fit: () => ({ id, summary: [], tables: [], diagnostics: [], message: '' }),
  exportCsv: () => '',
})

const plugins = [
  makePlugin('ols', '线性回归', '回归建模', ['reg']),
  makePlugin('freq', '频数', '数据探索', ['count']),
  makePlugin('chi', '交叉', '相关关系', ['chi']),
]

const modelOrder = new Map(plugins.map((plugin, index) => [plugin.id, index]))
const getTaskGroup = (plugin: ModelPlugin) => plugin.category

describe('model usage helpers', () => {
  it('records model usage without mutating existing usage', () => {
    const usage = recordModelUsage({ ols: { usedCount: 1, lastUsedAt: '2026-01-01T00:00:00.000Z' } }, 'ols', '2026-01-02T00:00:00.000Z')

    expect(usage.ols).toEqual({ usedCount: 2, lastUsedAt: '2026-01-02T00:00:00.000Z' })
  })

  it('filters models by task group and query', () => {
    const result = filterAndSortModelPlugins({
      plugins,
      query: 'count',
      selectedCategory: '数据探索',
      allCategory: '全部',
      activeModelId: null,
      modelUsage: {},
      modelOrder,
      getTaskGroup,
    })

    expect(result.map((plugin) => plugin.id)).toEqual(['freq'])
  })

  it('sorts the active model first, then recent usage, then model order', () => {
    const result = filterAndSortModelPlugins({
      plugins,
      query: '',
      selectedCategory: '全部',
      allCategory: '全部',
      activeModelId: 'chi',
      modelUsage: {
        freq: { usedCount: 1, lastUsedAt: '2026-01-03T00:00:00.000Z' },
        ols: { usedCount: 9, lastUsedAt: '2026-01-02T00:00:00.000Z' },
      },
      modelOrder,
      getTaskGroup,
    })

    expect(result.map((plugin) => plugin.id)).toEqual(['chi', 'freq', 'ols'])
  })

  it('returns recently used models excluding the active model', () => {
    const recent = getRecentModelPlugins(
      plugins,
      {
        freq: { usedCount: 1, lastUsedAt: '2026-01-03T00:00:00.000Z' },
        ols: { usedCount: 1, lastUsedAt: '2026-01-02T00:00:00.000Z' },
      },
      'freq',
    )

    expect(recent.map((plugin) => plugin.id)).toEqual(['ols'])
  })
})
