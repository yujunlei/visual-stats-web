import { toNumber } from '../../data/tableUtils'
import type { Row } from '../../data/types'
import { mean, pearson, stdDev, twoSidedT, variance } from '../shared/commonStats'
import { compactConfig, paramArray, paramNumber, paramString } from '../shared/config'
import { csvSummarySection, csvTableSection } from '../shared/csv'
import type { ModelPlugin, ModelResult } from '../types'

const surveyCategory = '问卷研究'
const allTypes = ['numeric', 'category', 'date', 'text'] as const

const exportAllTables = (result: ModelResult, formula: string) =>
  [...csvSummarySection(formula, result.summary), ...result.tables.flatMap((table) => ['', ...csvTableSection(table)])].join('\n')

const cleanItemRows = (rows: Row[], items: string[]) =>
  rows
    .map((row) => items.map((item) => toNumber(row[item])))
    .filter((values): values is number[] => values.every((value) => value !== null))

const totalScores = (itemRows: number[][]) => itemRows.map((values) => values.reduce((sum, value) => sum + value, 0))

const cronbachAlpha = (itemRows: number[][]) => {
  const itemCount = itemRows[0]?.length ?? 0
  if (itemCount < 2) throw new Error('信度分析至少需要 2 个题项。')
  if (itemRows.length < 3) throw new Error('信度分析至少需要 3 条完整样本。')

  const totals = totalScores(itemRows)
  const totalVariance = variance(totals)
  if (totalVariance === 0) return 0

  const itemVarianceSum = Array.from({ length: itemCount }, (_, index) => variance(itemRows.map((row) => row[index]))).reduce((sum, value) => sum + value, 0)
  return (itemCount / (itemCount - 1)) * (1 - itemVarianceSum / totalVariance)
}

const selectedColumns = (configItems: string[], featureColumns: string[], fallbackCount = 4) => {
  const selected = configItems.filter((item) => featureColumns.includes(item))
  return selected.length > 0 ? selected : featureColumns.slice(0, fallbackCount)
}

const isChecked = (value: Row[string]) => {
  if (value === null || value === undefined || value === '') return false
  const normalized = String(value).trim().toLowerCase()
  return !['0', 'false', 'no', 'n', '否', '无', '未选'].includes(normalized)
}

export const reliabilityAnalysisPlugin: ModelPlugin = {
  id: 'reliability-analysis',
  name: '信度分析',
  nodeLabel: '信度分析',
  panelLabel: 'Reliability',
  resultLabel: '信度分析',
  description: '计算 Cronbach alpha、CITC 和删除题项后的 alpha。',
  methodLabel: 'Cronbach Alpha',
  shortName: 'ALPHA',
  fullName: 'Reliability Analysis',
  category: surveyCategory,
  keywords: ['reliability', 'cronbach', 'alpha', '信度', '量表'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '题项',
  downloadName: 'reliability-analysis.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: ['numeric'],
  usesRawRows: true,
  parameterSchema: [{ id: 'items', label: '量表题项', kind: 'columns', role: 'feature', columnTypes: ['numeric'], required: true }],

  getDefaultConfig(featureColumns) {
    const items = featureColumns.slice(0, 4)
    return compactConfig('', { items }, items)
  },

  sanitizeConfig(config, featureColumns) {
    const items = selectedColumns(paramArray(config, 'items', config.features), featureColumns)
    return compactConfig('', { items }, items)
  },

  getFormula(config) {
    return `alpha ${paramArray(config, 'items', config.features).join(' ')}`
  },

  getSettings(config) {
    return [{ label: '题项数', value: String(paramArray(config, 'items', config.features).length) }]
  },

  fit({ rows, config }) {
    const items = paramArray(config, 'items', config.features)
    const itemRows = cleanItemRows(rows, items)
    const alpha = cronbachAlpha(itemRows)
    const totals = totalScores(itemRows)
    const tableRows = items.map((item, index) => {
      const itemValues = itemRows.map((row) => row[index])
      const restTotals = totals.map((total, rowIndex) => total - itemRows[rowIndex][index])
      const alphaDeletedRows = itemRows.map((row) => row.filter((_, columnIndex) => columnIndex !== index))
      return {
        item,
        mean: mean(itemValues),
        stdDev: stdDev(itemValues),
        citc: pearson(itemValues, restTotals),
        alphaIfDeleted: alphaDeletedRows[0]?.length >= 2 ? cronbachAlpha(alphaDeletedRows) : 0,
      }
    })

    return {
      id: this.id,
      summary: [
        { label: 'Cronbach alpha', value: alpha },
        { label: 'valid cases', value: itemRows.length },
        { label: 'items', value: items.length },
      ],
      tables: [{ id: 'reliability', title: '信度题项统计', columns: ['item', 'mean', 'stdDev', 'citc', 'alphaIfDeleted'], rows: tableRows }],
      diagnostics: [],
      message: 'Cronbach alpha 越高通常表示量表内部一致性越好；CITC 用于识别与总分相关较弱的题项。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const itemAnalysisPlugin: ModelPlugin = {
  id: 'item-analysis',
  name: '项目分析',
  nodeLabel: '项目分析',
  panelLabel: 'Item Analysis',
  resultLabel: '项目分析',
  description: '按总分高低组比较题项差异，并计算项目-总分相关。',
  methodLabel: 'Item Discrimination',
  shortName: 'ITEM',
  fullName: 'Item Analysis',
  category: surveyCategory,
  keywords: ['item analysis', '项目分析', '区分度', '高低分组'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '题项',
  downloadName: 'item-analysis.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: ['numeric'],
  usesRawRows: true,
  parameterSchema: [{ id: 'items', label: '题项', kind: 'columns', role: 'feature', columnTypes: ['numeric'], required: true }],

  getDefaultConfig(featureColumns) {
    const items = featureColumns.slice(0, 4)
    return compactConfig('', { items }, items)
  },

  sanitizeConfig(config, featureColumns) {
    const items = selectedColumns(paramArray(config, 'items', config.features), featureColumns)
    return compactConfig('', { items }, items)
  },

  getFormula(config) {
    return `item-analysis ${paramArray(config, 'items', config.features).join(' ')}`
  },

  getSettings(config) {
    return [
      { label: '题项数', value: String(paramArray(config, 'items', config.features).length) },
      { label: '分组规则', value: '总分前后 27%' },
    ]
  },

  fit({ rows, config }) {
    const items = paramArray(config, 'items', config.features)
    const itemRows = cleanItemRows(rows, items)
      .map((values) => ({ values, total: values.reduce((sum, value) => sum + value, 0) }))
      .sort((left, right) => left.total - right.total)
    const groupSize = Math.max(2, Math.floor(itemRows.length * 0.27))
    if (itemRows.length < groupSize * 2) throw new Error('项目分析完整样本太少，无法构造高低分组。')

    const low = itemRows.slice(0, groupSize)
    const high = itemRows.slice(-groupSize)
    const allValues = itemRows.map((row) => row.values)
    const totals = itemRows.map((row) => row.total)
    const tableRows = items.map((item, index) => {
      const highValues = high.map((row) => row.values[index])
      const lowValues = low.map((row) => row.values[index])
      const highMean = mean(highValues)
      const lowMean = mean(lowValues)
      const se = Math.sqrt(variance(highValues) / highValues.length + variance(lowValues) / lowValues.length)
      const tValue = se === 0 ? 0 : (highMean - lowMean) / se
      return {
        item,
        highMean,
        lowMean,
        difference: highMean - lowMean,
        tValue,
        pValue: twoSidedT(tValue, highValues.length + lowValues.length - 2),
        itemTotalCorrelation: pearson(allValues.map((row) => row[index]), totals),
      }
    })

    return {
      id: this.id,
      summary: [
        { label: 'valid cases', value: itemRows.length },
        { label: 'items', value: items.length },
        { label: 'group size', value: groupSize },
      ],
      tables: [{ id: 'items', title: '项目区分度', columns: ['item', 'highMean', 'lowMean', 'difference', 'tValue', 'pValue', 'itemTotalCorrelation'], rows: tableRows }],
      diagnostics: [],
      message: '项目分析使用总分前后 27% 高低组比较题项均值，并报告项目-总分相关。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const multipleResponsePlugin: ModelPlugin = {
  id: 'multiple-response-analysis',
  name: '多选题',
  nodeLabel: '多选题',
  panelLabel: 'Multiple Response',
  resultLabel: '多选题统计',
  description: '统计多个 0/1 或勾选列的选择次数、响应占比和个案占比。',
  methodLabel: 'Multiple Response',
  shortName: 'MR',
  fullName: 'Multiple Response Analysis',
  category: surveyCategory,
  keywords: ['multiple response', '多选题', '多选', '问卷'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '选项列',
  downloadName: 'multiple-response.csv',
  supportsCategoricalFeatures: true,
  supportedFeatureTypes: [...allTypes],
  usesRawRows: true,
  parameterSchema: [{ id: 'options', label: '多选题选项列', kind: 'columns', role: 'feature', columnTypes: [...allTypes], required: true }],

  getDefaultConfig(featureColumns) {
    const options = featureColumns.slice(0, 6)
    return compactConfig('', { options }, options)
  },

  sanitizeConfig(config, featureColumns) {
    const options = selectedColumns(paramArray(config, 'options', config.features), featureColumns, 6)
    return compactConfig('', { options }, options)
  },

  getFormula(config) {
    return `multiple-response ${paramArray(config, 'options', config.features).join(' ')}`
  },

  getSettings(config) {
    return [{ label: '选项列数', value: String(paramArray(config, 'options', config.features).length) }]
  },

  fit({ rows, config }) {
    const options = paramArray(config, 'options', config.features)
    if (options.length === 0) throw new Error('多选题分析需要选择至少一个选项列。')
    const counts = options.map((option) => ({ option, selected: 0 }))
    let validCases = 0
    rows.forEach((row) => {
      const selectedIndexes = options.map((option, index) => (isChecked(row[option]) ? index : -1)).filter((index) => index >= 0)
      if (selectedIndexes.length === 0) return
      validCases += 1
      selectedIndexes.forEach((index) => {
        counts[index].selected += 1
      })
    })
    const totalResponses = counts.reduce((sum, row) => sum + row.selected, 0)
    const tableRows = counts.map((row) => ({
      option: row.option,
      selected: row.selected,
      responsePercent: totalResponses === 0 ? 0 : row.selected / totalResponses,
      casePercent: validCases === 0 ? 0 : row.selected / validCases,
    }))

    return {
      id: this.id,
      summary: [
        { label: 'valid cases', value: validCases },
        { label: 'responses', value: totalResponses },
        { label: 'options', value: options.length },
      ],
      tables: [{ id: 'multiple-response', title: '多选题频数', columns: ['option', 'selected', 'responsePercent', 'casePercent'], rows: tableRows }],
      diagnostics: [],
      message: '多选题统计将非空、非 0、非否定值视为已选择。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const npsAnalysisPlugin: ModelPlugin = {
  id: 'nps-analysis',
  name: 'NPS',
  nodeLabel: 'NPS',
  panelLabel: 'NPS',
  resultLabel: 'NPS 评分',
  description: '按 0-10 推荐意愿评分计算推荐者、被动者、贬损者和 NPS。',
  methodLabel: 'Net Promoter Score',
  shortName: 'NPS',
  fullName: 'Net Promoter Score',
  category: surveyCategory,
  keywords: ['nps', '推荐值', '净推荐值'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '评分变量',
  downloadName: 'nps-analysis.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: ['numeric'],
  usesRawRows: true,
  parameterSchema: [{ id: 'score', label: 'NPS 评分变量', kind: 'column', role: 'feature', columnTypes: ['numeric'], required: true }],

  getDefaultConfig(featureColumns) {
    const score = featureColumns[0] ?? ''
    return compactConfig('', { score }, [score])
  },

  sanitizeConfig(config, featureColumns) {
    const score = featureColumns.includes(paramString(config, 'score', config.features[0])) ? paramString(config, 'score', config.features[0]) : featureColumns[0] ?? ''
    return compactConfig('', { score }, [score])
  },

  getFormula(config) {
    return `nps ${paramString(config, 'score', config.features[0] ?? 'score')}`
  },

  getSettings(config) {
    return [{ label: '评分变量', value: paramString(config, 'score', config.features[0]) || '未选择' }]
  },

  fit({ rows, config }) {
    const score = paramString(config, 'score', config.features[0])
    const values = rows.map((row) => toNumber(row[score])).filter((value): value is number => value !== null)
    if (values.length === 0) throw new Error('NPS 分析需要至少一条有效评分。')
    const promoters = values.filter((value) => value >= 9).length
    const passives = values.filter((value) => value >= 7 && value < 9).length
    const detractors = values.filter((value) => value <= 6).length
    const nps = ((promoters - detractors) / values.length) * 100

    return {
      id: this.id,
      summary: [
        { label: 'NPS', value: nps },
        { label: 'valid cases', value: values.length },
        { label: 'promoters', value: promoters },
        { label: 'detractors', value: detractors },
      ],
      tables: [
        {
          id: 'nps',
          title: 'NPS 分布',
          columns: ['group', 'count', 'percent'],
          rows: [
            { group: '推荐者(9-10)', count: promoters, percent: promoters / values.length },
            { group: '被动者(7-8)', count: passives, percent: passives / values.length },
            { group: '贬损者(0-6)', count: detractors, percent: detractors / values.length },
          ],
        },
      ],
      diagnostics: [],
      message: 'NPS = 推荐者占比 - 贬损者占比，结果以百分制表示。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const contentValidityPlugin: ModelPlugin = {
  id: 'content-validity',
  name: '内容效度',
  nodeLabel: '内容效度',
  panelLabel: 'Content Validity',
  resultLabel: '内容效度',
  description: '按专家评分计算 I-CVI、S-CVI/Ave 和专家一致比例。',
  methodLabel: 'Content Validity Index',
  shortName: 'CVI',
  fullName: 'Content Validity Index',
  category: surveyCategory,
  keywords: ['content validity', 'cvi', '内容效度', '专家评分'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '评分题项',
  downloadName: 'content-validity.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: ['numeric'],
  usesRawRows: true,
  parameterSchema: [
    { id: 'items', label: '专家评分题项', kind: 'columns', role: 'feature', columnTypes: ['numeric'], required: true },
    { id: 'threshold', label: '有效评分阈值', kind: 'number', defaultValue: 3, helperText: '评分大于等于该阈值视为内容有效。' },
  ],

  getDefaultConfig(featureColumns) {
    const items = featureColumns.slice(0, 4)
    return compactConfig('', { items, threshold: 3 }, items)
  },

  sanitizeConfig(config, featureColumns) {
    const items = selectedColumns(paramArray(config, 'items', config.features), featureColumns)
    return compactConfig('', { items, threshold: paramNumber(config, 'threshold', 3) }, items)
  },

  getFormula(config) {
    return `cvi ${paramArray(config, 'items', config.features).join(' ')}`
  },

  getSettings(config) {
    return [
      { label: '题项数', value: String(paramArray(config, 'items', config.features).length) },
      { label: '有效阈值', value: String(paramNumber(config, 'threshold', 3)) },
    ]
  },

  fit({ rows, config }) {
    const items = paramArray(config, 'items', config.features)
    const threshold = paramNumber(config, 'threshold', 3)
    const tableRows = items.map((item) => {
      const values = rows.map((row) => toNumber(row[item])).filter((value): value is number => value !== null)
      const valid = values.filter((value) => value >= threshold).length
      return {
        item,
        experts: values.length,
        valid,
        iCvi: values.length === 0 ? 0 : valid / values.length,
        universalAgreement: values.length > 0 && valid === values.length ? 1 : 0,
      }
    })
    if (tableRows.every((row) => row.experts === 0)) throw new Error('内容效度分析需要至少一列有效专家评分。')
    const sCviAve = mean(tableRows.map((row) => row.iCvi))
    const sCviUa = mean(tableRows.map((row) => row.universalAgreement))

    return {
      id: this.id,
      summary: [
        { label: 'S-CVI/Ave', value: sCviAve },
        { label: 'S-CVI/UA', value: sCviUa },
        { label: 'items', value: items.length },
        { label: 'threshold', value: threshold },
      ],
      tables: [{ id: 'content-validity', title: '内容效度指数', columns: ['item', 'experts', 'valid', 'iCvi', 'universalAgreement'], rows: tableRows }],
      diagnostics: [],
      message: 'I-CVI 表示单个题项被专家评为有效的比例，S-CVI/Ave 为各题项 I-CVI 平均值。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return exportAllTables(result, this.getFormula(config))
  },
}

export const surveyResearchPlugins = [
  reliabilityAnalysisPlugin,
  itemAnalysisPlugin,
  multipleResponsePlugin,
  npsAnalysisPlugin,
  contentValidityPlugin,
]
