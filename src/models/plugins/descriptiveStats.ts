import { toNumber } from '../../data/tableUtils'
import { csvSummarySection, csvTableSection } from '../shared/csv'
import type { ModelPlugin, ModelResult } from '../types'

const columns = ['variable', 'n', 'missing', 'mean', 'stdDev', 'min', 'max']

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const standardDeviation = (values: number[], average: number) => {
  if (values.length <= 1) return 0
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export const descriptiveStatsPlugin: ModelPlugin = {
  id: 'descriptive-statistics',
  name: '描述统计',
  nodeLabel: '描述统计',
  panelLabel: 'Descriptive Statistics',
  resultLabel: '变量摘要',
  description: '快速查看数值变量的样本数、缺失值、均值、标准差和范围。',
  methodLabel: 'Summary',
  shortName: 'DESC',
  fullName: 'Descriptive Statistics',
  category: '基础统计',
  keywords: ['describe', 'summary', 'descriptive', 'stats', '描述统计', '摘要'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '统计变量',
  downloadName: 'descriptive-statistics-report.csv',
  supportsCategoricalFeatures: false,

  getDefaultConfig(numericColumns) {
    return {
      target: '',
      features: numericColumns.slice(0, 6),
    }
  },

  sanitizeConfig(config, numericColumns) {
    const features = config.features.filter((feature) => numericColumns.includes(feature))

    return {
      target: '',
      features: features.length > 0 ? features : numericColumns.slice(0, 6),
    }
  },

  getFormula(config) {
    return config.features.length > 0 ? `describe ${config.features.join(', ')}` : 'describe numeric variables'
  },

  getSettings(config) {
    return [
      { label: '推断方法', value: this.methodLabel },
      { label: '变量数', value: String(config.features.length) },
      { label: '缺失值', value: '逐列统计' },
    ]
  },

  fit({ rows, config }) {
    if (config.features.length === 0) {
      throw new Error('请选择至少一个数值变量。')
    }

    const summaryRows = config.features.map((feature) => {
      const values = rows.map((row) => toNumber(row[feature])).filter((value): value is number => value !== null)
      const average = values.length > 0 ? mean(values) : 0

      return {
        variable: feature,
        n: values.length,
        missing: rows.length - values.length,
        mean: average,
        stdDev: standardDeviation(values, average),
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
      }
    })

    const totalNumericValues = summaryRows.reduce((sum, row) => sum + row.n, 0)
    const maxMissing = summaryRows.reduce((max, row) => Math.max(max, row.missing), 0)

    return {
      id: this.id,
      summary: [
        { label: 'variables', value: config.features.length },
        { label: 'rows', value: rows.length },
        { label: 'numeric cells', value: totalNumericValues },
        { label: 'max missing', value: maxMissing },
      ],
      tables: [
        {
          id: 'summary',
          title: '变量摘要',
          columns,
          rows: summaryRows,
        },
      ],
      diagnostics: [],
      message: '描述统计已按变量逐列计算，缺失值不会参与均值和标准差。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    const table = result.tables.find((entry) => entry.id === 'summary')

    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...(table ? ['', ...csvTableSection(table)] : []),
    ].join('\n')
  },
}
