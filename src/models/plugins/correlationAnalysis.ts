import { toNumber } from '../../data/tableUtils'
import { csvRow, csvSummarySection, csvTableSection } from '../shared/csv'
import type { ModelPlugin, ModelResult } from '../types'

const pairColumns = ['pair', 'correlation', 'n', 'strength']

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const pearson = (left: number[], right: number[]) => {
  const leftMean = mean(left)
  const rightMean = mean(right)
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0)
  const leftDenominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0))
  const rightDenominator = Math.sqrt(right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0))

  if (leftDenominator === 0 || rightDenominator === 0) return 0
  return numerator / (leftDenominator * rightDenominator)
}

const strengthLabel = (value: number) => {
  const absolute = Math.abs(value)
  if (absolute >= 0.8) return 'very strong'
  if (absolute >= 0.6) return 'strong'
  if (absolute >= 0.4) return 'moderate'
  if (absolute >= 0.2) return 'weak'
  return 'very weak'
}

export const correlationAnalysisPlugin: ModelPlugin = {
  id: 'correlation-analysis',
  name: '相关分析',
  nodeLabel: '相关分析',
  panelLabel: 'Correlation Analysis',
  resultLabel: '强相关配对',
  description: '计算多个数值变量之间的 Pearson 相关系数，并用矩阵查看关系强弱。',
  methodLabel: 'Pearson',
  shortName: 'CORR',
  fullName: 'Pearson Correlation',
  category: '相关分析',
  keywords: ['corr', 'correlation', 'pearson', '相关', '相关分析', '相关系数'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '分析变量',
  downloadName: 'correlation-analysis-report.csv',
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
      features: features.length > 1 ? features : numericColumns.slice(0, 6),
    }
  },

  getFormula(config) {
    return config.features.length > 0 ? `corr ${config.features.join(', ')}` : 'corr numeric variables'
  },

  getSettings(config) {
    return [
      { label: '相关方法', value: this.methodLabel },
      { label: '变量数', value: String(config.features.length) },
      { label: '缺失值', value: '成对删除' },
    ]
  },

  fit({ rows, config }) {
    if (config.features.length < 2) {
      throw new Error('相关分析至少需要两个数值变量。')
    }

    const matrix = config.features.map((leftFeature) =>
      config.features.map((rightFeature) => {
        const pairs = rows
          .map((row) => [toNumber(row[leftFeature]), toNumber(row[rightFeature])] as const)
          .filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null)

        return pearson(
          pairs.map((pair) => pair[0]),
          pairs.map((pair) => pair[1]),
        )
      }),
    )

    const pairRows = config.features
      .flatMap((leftFeature, leftIndex) =>
        config.features.slice(leftIndex + 1).map((rightFeature, offset) => {
          const rightIndex = leftIndex + offset + 1
          const n = rows.filter((row) => toNumber(row[leftFeature]) !== null && toNumber(row[rightFeature]) !== null).length
          const correlation = matrix[leftIndex][rightIndex]

          return {
            pair: `${leftFeature} / ${rightFeature}`,
            correlation,
            n,
            strength: strengthLabel(correlation),
          }
        }),
      )
      .sort((left, right) => Math.abs(right.correlation) - Math.abs(left.correlation))

    const strongest = pairRows[0]?.correlation ?? 0

    return {
      id: this.id,
      summary: [
        { label: 'variables', value: config.features.length },
        { label: 'pairs', value: pairRows.length },
        { label: 'strongest |r|', value: Math.abs(strongest) },
        { label: 'method', value: this.methodLabel },
      ],
      tables: [
        {
          id: 'pairs',
          title: '强相关配对',
          columns: pairColumns,
          rows: pairRows,
        },
      ],
      diagnostics: [
        {
          id: 'correlation-matrix',
          title: '相关矩阵',
          kind: 'correlation-matrix',
          variables: config.features,
          matrix,
        },
      ],
      message: '相关系数使用 Pearson 方法计算；缺失值按变量配对自动删除。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    const table = result.tables.find((entry) => entry.id === 'pairs')
    const matrix = result.diagnostics.find((entry) => entry.kind === 'correlation-matrix')

    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...(table ? ['', ...csvTableSection(table)] : []),
      '',
      'correlation_matrix',
      matrix ? csvRow(['', ...matrix.variables]) : '',
      ...(matrix?.matrix.map((row, index) => csvRow([matrix.variables[index], ...row])) ?? []),
    ].join('\n')
  },
}
