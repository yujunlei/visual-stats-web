import { chiSquarePValue, compactValue, excessKurtosis, mean, median, normalPValue, numericValues, pairedNumericValues, quantile, rankValues, skewness, stdDev, twoSidedT, variance } from '../shared/commonStats'
import { compactConfig, paramNumber, paramString } from '../shared/config'
import { csvSummarySection, csvTableSection } from '../shared/csv'
import type { ModelPlugin, ModelResult } from '../types'

const commonCategory = '通用方法'
const allTypes = ['numeric', 'category', 'date', 'text'] as const

const exportAllTables = (result: ModelResult, formula: string) =>
  [...csvSummarySection(formula, result.summary), ...result.tables.flatMap((table) => ['', ...csvTableSection(table)])].join('\n')

export const frequencyAnalysisPlugin: ModelPlugin = {
  id: 'frequency-analysis',
  name: '频数',
  nodeLabel: '频数',
  panelLabel: 'Frequency',
  resultLabel: '频数表',
  description: '统计单个变量的取值频数、占比和累计占比。',
  methodLabel: 'Frequency',
  shortName: 'FREQ',
  fullName: 'Frequency Table',
  category: commonCategory,
  keywords: ['frequency', 'freq', 'count', '频数', '频率'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '频数变量',
  downloadName: 'frequency-report.csv',
  supportsCategoricalFeatures: true,
  supportedFeatureTypes: [...allTypes],
  includeDimensionFields: true,
  usesRawRows: true,
  parameterSchema: [{ id: 'variable', label: '统计变量', kind: 'column', role: 'feature', columnTypes: [...allTypes], required: true }],

  getDefaultConfig(featureColumns) {
    const params = { variable: featureColumns[0] ?? '' }
    return compactConfig('', params, [params.variable])
  },

  sanitizeConfig(config, featureColumns) {
    const variable = featureColumns.includes(paramString(config, 'variable', config.features[0])) ? paramString(config, 'variable', config.features[0]) : featureColumns[0] ?? ''
    return compactConfig('', { variable }, [variable])
  },

  getFormula(config) {
    return `tabulate ${paramString(config, 'variable', config.features[0] ?? 'var')}`
  },

  getSettings(config) {
    return [
      { label: '变量', value: paramString(config, 'variable', config.features[0]) || '未选择' },
      { label: '输出', value: '频数 / 占比 / 累计占比' },
    ]
  },

  fit({ rows, config }) {
    const variable = paramString(config, 'variable', config.features[0])
    if (!variable) throw new Error('频数统计需要选择一个变量。')

    const counts = new Map<string, number>()
    let missing = 0
    rows.forEach((row) => {
      const value = row[variable]
      if (value === null || value === undefined || value === '') {
        missing += 1
        return
      }
      const key = compactValue(value)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    const total = rows.length - missing
    let cumulative = 0
    const tableRows = Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([value, count]) => {
        cumulative += count
        return {
          value,
          count,
          percent: total === 0 ? 0 : count / total,
          cumulativePercent: total === 0 ? 0 : cumulative / total,
        }
      })

    return {
      id: this.id,
      summary: [
        { label: 'rows', value: rows.length },
        { label: 'valid', value: total },
        { label: 'missing', value: missing },
        { label: 'categories', value: counts.size },
      ],
      tables: [{ id: 'frequency', title: '频数表', columns: ['value', 'count', 'percent', 'cumulativePercent'], rows: tableRows }],
      diagnostics: [],
      message: '频数表按出现次数降序排列，缺失值不参与占比计算。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const categorySummaryPlugin: ModelPlugin = {
  id: 'category-summary',
  name: '分类汇总',
  nodeLabel: '分类汇总',
  panelLabel: 'Category Summary',
  resultLabel: '分组摘要',
  description: '按分类变量汇总数值变量的样本量、均值、中位数和波动。',
  methodLabel: 'Grouped Summary',
  shortName: 'GROUP',
  fullName: 'Grouped Summary',
  category: commonCategory,
  keywords: ['group summary', '分类汇总', '分组摘要'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '分组变量与数值变量',
  downloadName: 'category-summary-report.csv',
  supportsCategoricalFeatures: true,
  supportedFeatureTypes: [...allTypes],
  includeDimensionFields: true,
  usesRawRows: true,
  parameterSchema: [
    { id: 'group', label: '分组变量', kind: 'column', role: 'feature', columnTypes: ['category', 'date', 'text', 'numeric'], required: true },
    { id: 'variable', label: '数值变量', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const params = { group: featureColumns.find((column) => !targetColumns.includes(column)) ?? featureColumns[0] ?? '', variable: targetColumns[0] ?? '' }
    return compactConfig('', params, [params.group, params.variable])
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const group = featureColumns.includes(paramString(config, 'group', config.features[0])) ? paramString(config, 'group', config.features[0]) : featureColumns[0] ?? ''
    const variable = targetColumns.includes(paramString(config, 'variable', config.features[1])) ? paramString(config, 'variable', config.features[1]) : targetColumns[0] ?? ''
    return compactConfig('', { group, variable }, [group, variable])
  },

  getFormula(config) {
    return `table ${paramString(config, 'group', 'group')}, summarize(${paramString(config, 'variable', 'x')})`
  },

  getSettings(config) {
    return [
      { label: '分组变量', value: paramString(config, 'group', config.features[0]) || '未选择' },
      { label: '数值变量', value: paramString(config, 'variable', config.features[1]) || '未选择' },
    ]
  },

  fit({ rows, config }) {
    const group = paramString(config, 'group')
    const variable = paramString(config, 'variable')
    if (!group || !variable) throw new Error('分类汇总需要选择分组变量和数值变量。')

    const groups = new Map<string, number[]>()
    rows.forEach((row) => {
      const value = Number(row[variable])
      if (!Number.isFinite(value)) return
      const key = compactValue(row[group])
      groups.set(key, [...(groups.get(key) ?? []), value])
    })
    const tableRows = Array.from(groups.entries())
      .map(([groupValue, values]) => ({
        group: groupValue,
        n: values.length,
        mean: mean(values),
        median: median(values),
        stdDev: stdDev(values),
        min: Math.min(...values),
        max: Math.max(...values),
      }))
      .sort((left, right) => right.n - left.n)

    return {
      id: this.id,
      summary: [
        { label: 'groups', value: tableRows.length },
        { label: 'valid', value: tableRows.reduce((sum, row) => sum + row.n, 0) },
        { label: 'variable', value: variable },
        { label: 'group field', value: group },
      ],
      tables: [{ id: 'summary', title: '分类汇总', columns: ['group', 'n', 'mean', 'median', 'stdDev', 'min', 'max'], rows: tableRows }],
      diagnostics: [],
      message: '分类汇总按分组变量计算，数值变量缺失值已自动排除。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const crosstabChiSquarePlugin: ModelPlugin = {
  id: 'crosstab-chi-square',
  name: '交叉(卡方)',
  nodeLabel: '交叉(卡方)',
  panelLabel: 'Crosstab Chi-square',
  resultLabel: '交叉表',
  description: '生成两个分类变量的交叉表，并计算 Pearson 卡方检验。',
  methodLabel: 'Chi-square',
  shortName: 'CHI2',
  fullName: 'Crosstab Chi-square Test',
  category: commonCategory,
  keywords: ['crosstab', 'chi-square', 'chisq', '交叉表', '卡方'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '交叉变量',
  downloadName: 'crosstab-chi-square-report.csv',
  supportsCategoricalFeatures: true,
  supportedFeatureTypes: [...allTypes],
  includeDimensionFields: true,
  usesRawRows: true,
  parameterSchema: [
    { id: 'rowVar', label: '行变量', kind: 'column', role: 'feature', columnTypes: [...allTypes], required: true },
    { id: 'colVar', label: '列变量', kind: 'column', role: 'feature', columnTypes: [...allTypes], required: true },
  ],

  getDefaultConfig(featureColumns) {
    const params = { rowVar: featureColumns[0] ?? '', colVar: featureColumns[1] ?? '' }
    return compactConfig('', params, [params.rowVar, params.colVar])
  },

  sanitizeConfig(config, featureColumns) {
    const rowVar = featureColumns.includes(paramString(config, 'rowVar', config.features[0])) ? paramString(config, 'rowVar', config.features[0]) : featureColumns[0] ?? ''
    const colVar = featureColumns.includes(paramString(config, 'colVar', config.features[1])) && paramString(config, 'colVar', config.features[1]) !== rowVar ? paramString(config, 'colVar', config.features[1]) : featureColumns.find((column) => column !== rowVar) ?? ''
    return compactConfig('', { rowVar, colVar }, [rowVar, colVar])
  },

  getFormula(config) {
    return `tabulate ${paramString(config, 'rowVar', 'row')} ${paramString(config, 'colVar', 'col')}, chi2`
  },

  getSettings(config) {
    return [
      { label: '行变量', value: paramString(config, 'rowVar', config.features[0]) || '未选择' },
      { label: '列变量', value: paramString(config, 'colVar', config.features[1]) || '未选择' },
    ]
  },

  fit({ rows, config }) {
    const rowVar = paramString(config, 'rowVar')
    const colVar = paramString(config, 'colVar')
    if (!rowVar || !colVar) throw new Error('交叉表需要选择行变量和列变量。')

    const rowCategories = Array.from(new Set(rows.map((row) => compactValue(row[rowVar])))).sort()
    const colCategories = Array.from(new Set(rows.map((row) => compactValue(row[colVar])))).sort()
    const counts = rowCategories.map((rowCategory) =>
      colCategories.map((colCategory) => rows.filter((row) => compactValue(row[rowVar]) === rowCategory && compactValue(row[colVar]) === colCategory).length),
    )
    const rowTotals = counts.map((row) => row.reduce((sum, value) => sum + value, 0))
    const colTotals = colCategories.map((_, colIndex) => counts.reduce((sum, row) => sum + row[colIndex], 0))
    const total = rowTotals.reduce((sum, value) => sum + value, 0)
    let chiSquare = 0
    counts.forEach((row, rowIndex) => {
      row.forEach((observed, colIndex) => {
        const expected = (rowTotals[rowIndex] * colTotals[colIndex]) / total
        if (expected > 0) chiSquare += (observed - expected) ** 2 / expected
      })
    })
    const df = Math.max((rowCategories.length - 1) * (colCategories.length - 1), 1)
    const pValue = chiSquarePValue(chiSquare, df)
    const tableRows = rowCategories.map((rowCategory, rowIndex) => ({
      rowCategory,
      ...Object.fromEntries(colCategories.map((colCategory, colIndex) => [colCategory, counts[rowIndex][colIndex]])),
      rowTotal: rowTotals[rowIndex],
    }))

    return {
      id: this.id,
      summary: [
        { label: 'N', value: total },
        { label: 'Chi-square', value: chiSquare },
        { label: 'df', value: df },
        { label: 'p-value', value: pValue },
      ],
      tables: [{ id: 'crosstab', title: '交叉表', columns: ['rowCategory', ...colCategories, 'rowTotal'], rows: tableRows }],
      diagnostics: [],
      message: 'Pearson 卡方检验基于交叉表期望频数计算；小样本或低期望频数建议谨慎解释。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const varianceAnalysisPlugin: ModelPlugin = {
  id: 'variance-analysis',
  name: '方差',
  nodeLabel: '方差',
  panelLabel: 'Variance',
  resultLabel: '方差摘要',
  description: '计算数值变量的方差、标准差、极差和四分位距，可选分组变量。',
  methodLabel: 'Variance',
  shortName: 'VAR',
  fullName: 'Variance Summary',
  category: commonCategory,
  keywords: ['variance', 'std', '方差', '标准差'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '数值变量',
  downloadName: 'variance-report.csv',
  supportsCategoricalFeatures: true,
  supportedFeatureTypes: [...allTypes],
  includeDimensionFields: true,
  usesRawRows: true,
  parameterSchema: [
    { id: 'variable', label: '数值变量', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'group', label: '分组变量', kind: 'column', role: 'feature', columnTypes: ['category', 'date', 'text', 'numeric'], helperText: '可选；留空则整体计算。' },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const params = { variable: targetColumns[0] ?? '', group: '' }
    return compactConfig('', params, [params.variable])
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const variable = targetColumns.includes(paramString(config, 'variable', config.features[0])) ? paramString(config, 'variable', config.features[0]) : targetColumns[0] ?? ''
    const group = featureColumns.includes(paramString(config, 'group')) && paramString(config, 'group') !== variable ? paramString(config, 'group') : ''
    return compactConfig('', { variable, group }, [variable, group])
  },

  getFormula(config) {
    const group = paramString(config, 'group')
    return `variance ${paramString(config, 'variable', 'x')}${group ? ` by ${group}` : ''}`
  },

  getSettings(config) {
    return [
      { label: '数值变量', value: paramString(config, 'variable', config.features[0]) || '未选择' },
      { label: '分组变量', value: paramString(config, 'group') || '不分组' },
    ]
  },

  fit({ rows, config }) {
    const variable = paramString(config, 'variable')
    const group = paramString(config, 'group')
    if (!variable) throw new Error('方差分析需要选择数值变量。')

    const groups = new Map<string, number[]>()
    rows.forEach((row) => {
      const value = Number(row[variable])
      if (!Number.isFinite(value)) return
      const key = group ? compactValue(row[group]) : 'All'
      groups.set(key, [...(groups.get(key) ?? []), value])
    })
    const tableRows = Array.from(groups.entries()).map(([groupValue, values]) => ({
      group: groupValue,
      n: values.length,
      variance: variance(values),
      stdDev: stdDev(values),
      range: Math.max(...values) - Math.min(...values),
      iqr: quantile(values, 0.75) - quantile(values, 0.25),
    }))

    return {
      id: this.id,
      summary: [
        { label: 'groups', value: tableRows.length },
        { label: 'valid', value: tableRows.reduce((sum, row) => sum + row.n, 0) },
        { label: 'variable', value: variable },
        { label: 'grouped', value: group || 'No' },
      ],
      tables: [{ id: 'variance', title: '方差摘要', columns: ['group', 'n', 'variance', 'stdDev', 'range', 'iqr'], rows: tableRows }],
      diagnostics: [],
      message: '方差使用样本方差公式计算，缺失值已自动排除。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const independentTTestPlugin: ModelPlugin = {
  id: 'independent-t-test',
  name: '独立t检验',
  nodeLabel: '独立t检验',
  panelLabel: 'Independent t-test',
  resultLabel: '两组均值检验',
  description: '比较两个独立组在同一数值变量上的均值差异，默认取样本量最大的两个组。',
  methodLabel: 'Welch t-test',
  shortName: 'T2',
  fullName: 'Independent Samples t-test',
  category: commonCategory,
  keywords: ['t test', 'independent', '独立t检验', '两独立样本'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '分组变量与数值变量',
  downloadName: 'independent-t-test-report.csv',
  supportsCategoricalFeatures: true,
  supportedFeatureTypes: [...allTypes],
  includeDimensionFields: true,
  usesRawRows: true,
  parameterSchema: [
    { id: 'group', label: '分组变量', kind: 'column', role: 'feature', columnTypes: ['category', 'date', 'text', 'numeric'], required: true },
    { id: 'variable', label: '数值变量', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const params = { group: featureColumns.find((column) => !targetColumns.includes(column)) ?? featureColumns[0] ?? '', variable: targetColumns[0] ?? '' }
    return compactConfig('', params, [params.group, params.variable])
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const group = featureColumns.includes(paramString(config, 'group', config.features[0])) ? paramString(config, 'group', config.features[0]) : featureColumns[0] ?? ''
    const variable = targetColumns.includes(paramString(config, 'variable', config.features[1])) ? paramString(config, 'variable', config.features[1]) : targetColumns[0] ?? ''
    return compactConfig('', { group, variable }, [group, variable])
  },

  getFormula(config) {
    return `ttest ${paramString(config, 'variable', 'x')}, by(${paramString(config, 'group', 'group')})`
  },

  getSettings(config) {
    return [
      { label: '分组变量', value: paramString(config, 'group', config.features[0]) || '未选择' },
      { label: '数值变量', value: paramString(config, 'variable', config.features[1]) || '未选择' },
      { label: '方法', value: this.methodLabel },
    ]
  },

  fit({ rows, config }) {
    const group = paramString(config, 'group')
    const variable = paramString(config, 'variable')
    if (!group || !variable) throw new Error('独立 t 检验需要选择分组变量和数值变量。')
    const groups = new Map<string, number[]>()
    rows.forEach((row) => {
      const value = Number(row[variable])
      if (!Number.isFinite(value)) return
      const key = compactValue(row[group])
      groups.set(key, [...(groups.get(key) ?? []), value])
    })
    const selected = Array.from(groups.entries())
      .filter((entry) => entry[1].length > 1)
      .sort((left, right) => right[1].length - left[1].length)
      .slice(0, 2)
    if (selected.length < 2) throw new Error('独立 t 检验至少需要两个有效分组，且每组至少 2 个观测。')
    const [left, right] = selected
    const leftMean = mean(left[1])
    const rightMean = mean(right[1])
    const leftVariance = variance(left[1])
    const rightVariance = variance(right[1])
    const se = Math.sqrt(leftVariance / left[1].length + rightVariance / right[1].length)
    const tValue = se === 0 ? 0 : (leftMean - rightMean) / se
    const dfNumerator = (leftVariance / left[1].length + rightVariance / right[1].length) ** 2
    const dfDenominator = leftVariance ** 2 / (left[1].length ** 2 * (left[1].length - 1)) + rightVariance ** 2 / (right[1].length ** 2 * (right[1].length - 1))
    const df = dfDenominator === 0 ? left[1].length + right[1].length - 2 : dfNumerator / dfDenominator
    const pValue = twoSidedT(tValue, df)

    return {
      id: this.id,
      summary: [
        { label: 'group A', value: left[0] },
        { label: 'group B', value: right[0] },
        { label: 'mean diff', value: leftMean - rightMean },
        { label: 'p-value', value: pValue },
      ],
      tables: [
        { id: 'groups', title: '分组均值', columns: ['group', 'n', 'mean', 'stdDev'], rows: selected.map(([groupValue, values]) => ({ group: groupValue, n: values.length, mean: mean(values), stdDev: stdDev(values) })) },
        { id: 'test', title: 'Welch t 检验', columns: ['comparison', 'meanDiff', 'stdError', 'tValue', 'df', 'pValue'], rows: [{ comparison: `${left[0]} - ${right[0]}`, meanDiff: leftMean - rightMean, stdError: se, tValue, df, pValue }] },
      ],
      diagnostics: [],
      message: '独立 t 检验采用 Welch 方法，不要求两组方差相等；默认比较样本量最大的两个组。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const oneSampleTTestPlugin: ModelPlugin = {
  id: 'one-sample-t-test',
  name: '单样本t检验',
  nodeLabel: '单样本t检验',
  panelLabel: 'One-sample t-test',
  resultLabel: '均值检验',
  description: '检验单个数值变量的均值是否显著不同于给定检验值。',
  methodLabel: 'One-sample t-test',
  shortName: 'T1',
  fullName: 'One-sample t-test',
  category: commonCategory,
  keywords: ['one sample t test', '单样本t检验'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '数值变量',
  downloadName: 'one-sample-t-test-report.csv',
  supportsCategoricalFeatures: false,
  usesRawRows: true,
  parameterSchema: [
    { id: 'variable', label: '数值变量', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'mu', label: '检验值', kind: 'number', defaultValue: 0, helperText: '默认检验总体均值是否等于 0。' },
  ],

  getDefaultConfig(_featureColumns, targetColumns = _featureColumns) {
    const params = { variable: targetColumns[0] ?? '', mu: 0 }
    return compactConfig('', params, [params.variable])
  },

  sanitizeConfig(config, _featureColumns, targetColumns = _featureColumns) {
    const variable = targetColumns.includes(paramString(config, 'variable', config.features[0])) ? paramString(config, 'variable', config.features[0]) : targetColumns[0] ?? ''
    const mu = paramNumber(config, 'mu', 0)
    return compactConfig('', { variable, mu }, [variable])
  },

  getFormula(config) {
    return `ttest ${paramString(config, 'variable', 'x')} == ${paramNumber(config, 'mu', 0)}`
  },

  getSettings(config) {
    return [
      { label: '数值变量', value: paramString(config, 'variable', config.features[0]) || '未选择' },
      { label: '检验值', value: String(paramNumber(config, 'mu', 0)) },
    ]
  },

  fit({ rows, config }) {
    const variable = paramString(config, 'variable')
    const mu = paramNumber(config, 'mu', 0)
    const values = numericValues(rows, variable)
    if (!variable || values.length < 2) throw new Error('单样本 t 检验需要至少 2 个有效数值观测。')
    const average = mean(values)
    const sd = stdDev(values)
    const se = sd / Math.sqrt(values.length)
    const tValue = se === 0 ? 0 : (average - mu) / se
    const df = values.length - 1
    const pValue = twoSidedT(tValue, df)

    return {
      id: this.id,
      summary: [
        { label: 'N', value: values.length },
        { label: 'mean', value: average },
        { label: 'test value', value: mu },
        { label: 'p-value', value: pValue },
      ],
      tables: [{ id: 'test', title: '单样本 t 检验', columns: ['variable', 'n', 'mean', 'testValue', 'meanDiff', 'stdError', 'tValue', 'df', 'pValue'], rows: [{ variable, n: values.length, mean: average, testValue: mu, meanDiff: average - mu, stdError: se, tValue, df, pValue }] }],
      diagnostics: [],
      message: '单样本 t 检验假设样本独立且总体近似正态；大样本下对轻微偏离较稳健。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const pairedTTestPlugin: ModelPlugin = {
  id: 'paired-t-test',
  name: '配对t检验',
  nodeLabel: '配对t检验',
  panelLabel: 'Paired t-test',
  resultLabel: '配对差值检验',
  description: '比较两个配对数值变量的均值差异。',
  methodLabel: 'Paired t-test',
  shortName: 'TP',
  fullName: 'Paired Samples t-test',
  category: commonCategory,
  keywords: ['paired t test', '配对t检验'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '两个配对数值变量',
  downloadName: 'paired-t-test-report.csv',
  supportsCategoricalFeatures: false,
  usesRawRows: true,
  parameterSchema: [
    { id: 'left', label: '变量 A', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
    { id: 'right', label: '变量 B', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
  ],

  getDefaultConfig(_featureColumns, targetColumns = _featureColumns) {
    const params = { left: targetColumns[0] ?? '', right: targetColumns[1] ?? '' }
    return compactConfig('', params, [params.left, params.right])
  },

  sanitizeConfig(config, _featureColumns, targetColumns = _featureColumns) {
    const left = targetColumns.includes(paramString(config, 'left', config.features[0])) ? paramString(config, 'left', config.features[0]) : targetColumns[0] ?? ''
    const right = targetColumns.includes(paramString(config, 'right', config.features[1])) && paramString(config, 'right', config.features[1]) !== left ? paramString(config, 'right', config.features[1]) : targetColumns.find((column) => column !== left) ?? ''
    return compactConfig('', { left, right }, [left, right])
  },

  getFormula(config) {
    return `ttest ${paramString(config, 'left', 'a')} == ${paramString(config, 'right', 'b')}`
  },

  getSettings(config) {
    return [
      { label: '变量 A', value: paramString(config, 'left', config.features[0]) || '未选择' },
      { label: '变量 B', value: paramString(config, 'right', config.features[1]) || '未选择' },
    ]
  },

  fit({ rows, config }) {
    const left = paramString(config, 'left')
    const right = paramString(config, 'right')
    const pairs = pairedNumericValues(rows, left, right)
    if (!left || !right || pairs.length < 2) throw new Error('配对 t 检验需要两个数值变量，且至少 2 对有效观测。')
    const differences = pairs.map((pair) => pair[0] - pair[1])
    const averageDiff = mean(differences)
    const se = stdDev(differences) / Math.sqrt(differences.length)
    const tValue = se === 0 ? 0 : averageDiff / se
    const df = differences.length - 1
    const pValue = twoSidedT(tValue, df)

    return {
      id: this.id,
      summary: [
        { label: 'pairs', value: pairs.length },
        { label: 'mean diff', value: averageDiff },
        { label: 't', value: tValue },
        { label: 'p-value', value: pValue },
      ],
      tables: [{ id: 'test', title: '配对 t 检验', columns: ['comparison', 'pairs', 'meanDiff', 'stdError', 'tValue', 'df', 'pValue'], rows: [{ comparison: `${left} - ${right}`, pairs: pairs.length, meanDiff: averageDiff, stdError: se, tValue, df, pValue }] }],
      diagnostics: [],
      message: '配对 t 检验基于两列的逐行差值计算，缺失配对已自动排除。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const normalityTestPlugin: ModelPlugin = {
  id: 'normality-test',
  name: '正态性检验',
  nodeLabel: '正态性检验',
  panelLabel: 'Normality Test',
  resultLabel: '正态性结果',
  description: '计算偏度、峰度和 Jarque-Bera 正态性检验。',
  methodLabel: 'Jarque-Bera',
  shortName: 'NORM',
  fullName: 'Normality Test',
  category: commonCategory,
  keywords: ['normality', 'jarque bera', '正态性检验'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '数值变量',
  downloadName: 'normality-test-report.csv',
  supportsCategoricalFeatures: false,
  usesRawRows: true,

  getDefaultConfig(numericColumns) {
    return { target: '', features: numericColumns.slice(0, 6) }
  },

  sanitizeConfig(config, numericColumns) {
    const features = config.features.filter((feature) => numericColumns.includes(feature))
    return { target: '', features: features.length > 0 ? features : numericColumns.slice(0, 6) }
  },

  getFormula(config) {
    return `sktest ${config.features.join(', ') || 'numeric variables'}`
  },

  getSettings(config) {
    return [
      { label: '方法', value: this.methodLabel },
      { label: '变量数', value: String(config.features.length) },
    ]
  },

  fit({ rows, config }) {
    if (config.features.length === 0) throw new Error('正态性检验需要选择至少一个数值变量。')
    const tableRows = config.features.map((variable) => {
      const values = numericValues(rows, variable)
      const skew = skewness(values)
      const kurtosis = excessKurtosis(values)
      const jarqueBera = values.length * (skew ** 2 / 6 + kurtosis ** 2 / 24)
      return {
        variable,
        n: values.length,
        skewness: skew,
        excessKurtosis: kurtosis,
        jarqueBera,
        pValue: chiSquarePValue(jarqueBera, 2),
      }
    })

    return {
      id: this.id,
      summary: [
        { label: 'variables', value: tableRows.length },
        { label: 'method', value: this.methodLabel },
        { label: 'min p-value', value: Math.min(...tableRows.map((row) => row.pValue)) },
        { label: 'rows', value: rows.length },
      ],
      tables: [{ id: 'normality', title: '正态性检验', columns: ['variable', 'n', 'skewness', 'excessKurtosis', 'jarqueBera', 'pValue'], rows: tableRows }],
      diagnostics: [],
      message: '正态性检验使用 Jarque-Bera 近似；小样本建议后续接入 Shapiro-Wilk 复核。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const nonparametricTestPlugin: ModelPlugin = {
  id: 'nonparametric-test',
  name: '非参数检验',
  nodeLabel: '非参数检验',
  panelLabel: 'Nonparametric Test',
  resultLabel: '秩检验',
  description: '按分组数自动执行 Mann-Whitney U 或 Kruskal-Wallis 秩检验。',
  methodLabel: 'Rank test',
  shortName: 'NPAR',
  fullName: 'Nonparametric Rank Test',
  category: commonCategory,
  keywords: ['nonparametric', 'mann whitney', 'kruskal', '非参数检验', '秩检验'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '分组变量与数值变量',
  downloadName: 'nonparametric-test-report.csv',
  supportsCategoricalFeatures: true,
  supportedFeatureTypes: [...allTypes],
  includeDimensionFields: true,
  usesRawRows: true,
  parameterSchema: [
    { id: 'group', label: '分组变量', kind: 'column', role: 'feature', columnTypes: ['category', 'date', 'text', 'numeric'], required: true },
    { id: 'variable', label: '数值变量', kind: 'column', role: 'target', columnTypes: ['numeric'], required: true },
  ],

  getDefaultConfig(featureColumns, targetColumns = featureColumns) {
    const params = { group: featureColumns.find((column) => !targetColumns.includes(column)) ?? featureColumns[0] ?? '', variable: targetColumns[0] ?? '' }
    return compactConfig('', params, [params.group, params.variable])
  },

  sanitizeConfig(config, featureColumns, targetColumns = featureColumns) {
    const group = featureColumns.includes(paramString(config, 'group', config.features[0])) ? paramString(config, 'group', config.features[0]) : featureColumns[0] ?? ''
    const variable = targetColumns.includes(paramString(config, 'variable', config.features[1])) ? paramString(config, 'variable', config.features[1]) : targetColumns[0] ?? ''
    return compactConfig('', { group, variable }, [group, variable])
  },

  getFormula(config) {
    return `rank test ${paramString(config, 'variable', 'x')} by ${paramString(config, 'group', 'group')}`
  },

  getSettings(config) {
    return [
      { label: '分组变量', value: paramString(config, 'group', config.features[0]) || '未选择' },
      { label: '数值变量', value: paramString(config, 'variable', config.features[1]) || '未选择' },
    ]
  },

  fit({ rows, config }) {
    const group = paramString(config, 'group')
    const variable = paramString(config, 'variable')
    if (!group || !variable) throw new Error('非参数检验需要选择分组变量和数值变量。')
    const observations = rows
      .map((row) => ({ group: compactValue(row[group]), value: Number(row[variable]) }))
      .filter((entry) => Number.isFinite(entry.value))
    const groups = Array.from(new Set(observations.map((entry) => entry.group)))
    if (groups.length < 2) throw new Error('非参数检验至少需要两个有效分组。')
    const ranks = rankValues(observations.map((entry) => entry.value))
    const groupRows = groups.map((groupValue) => {
      const groupRanks = ranks.filter((_, index) => observations[index].group === groupValue)
      const values = observations.filter((entry) => entry.group === groupValue).map((entry) => entry.value)
      return {
        group: groupValue,
        n: values.length,
        median: median(values),
        rankSum: groupRanks.reduce((sum, value) => sum + value, 0),
        meanRank: mean(groupRanks),
      }
    })
    const totalN = observations.length
    const method = groups.length === 2 ? 'Mann-Whitney U' : 'Kruskal-Wallis'
    let testResult: { statistic: number; pValue: number }
    if (groups.length === 2) {
      const first = groupRows[0]
      const second = groupRows[1]
      const u1 = first.rankSum - (first.n * (first.n + 1)) / 2
      const u2 = second.rankSum - (second.n * (second.n + 1)) / 2
      const statistic = Math.min(u1, u2)
      const meanU = (first.n * second.n) / 2
      const sdU = Math.sqrt((first.n * second.n * (first.n + second.n + 1)) / 12)
      testResult = { statistic, pValue: normalPValue(sdU === 0 ? 0 : (statistic - meanU) / sdU) }
    } else {
      const statistic = (12 / (totalN * (totalN + 1))) * groupRows.reduce((sum, row) => sum + row.rankSum ** 2 / row.n, 0) - 3 * (totalN + 1)
      testResult = { statistic, pValue: chiSquarePValue(statistic, groups.length - 1) }
    }

    return {
      id: this.id,
      summary: [
        { label: 'method', value: method },
        { label: 'groups', value: groups.length },
        { label: 'statistic', value: testResult.statistic },
        { label: 'p-value', value: testResult.pValue },
      ],
      tables: [
        { id: 'groups', title: '秩汇总', columns: ['group', 'n', 'median', 'rankSum', 'meanRank'], rows: groupRows },
        { id: 'test', title: method, columns: ['method', 'statistic', 'df', 'pValue'], rows: [{ method, statistic: testResult.statistic, df: groups.length === 2 ? 1 : groups.length - 1, pValue: testResult.pValue }] },
      ],
      diagnostics: [],
      message: '非参数检验使用秩信息，适合分布偏态或方差差异较明显的探索场景。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const commonMethodPlugins = [
  frequencyAnalysisPlugin,
  categorySummaryPlugin,
  crosstabChiSquarePlugin,
  varianceAnalysisPlugin,
  independentTTestPlugin,
  oneSampleTTestPlugin,
  pairedTTestPlugin,
  normalityTestPlugin,
  nonparametricTestPlugin,
]
