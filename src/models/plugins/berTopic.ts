import { csvSummarySection, csvTableSection } from '../shared/csv'
import type { ModelPlugin, ModelResult } from '../types'

type Vector = Map<string, number>

const topicColumns = ['topic', 'documents', 'share', 'keywords', 'representative']
const documentColumns = ['document', 'topic', 'score', 'text']

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'with',
  'this',
  '这些',
  '一个',
  '可以',
  '以及',
  '没有',
  '我们',
  '他们',
  '进行',
  '通过',
  '数据',
])

const tokenize = (text: string) => {
  const normalized = text.toLowerCase()
  const matches = normalized.match(/[\p{Script=Han}]{2,}|[a-z][a-z0-9_-]{2,}/gu) ?? []

  return matches.flatMap((token) => {
    if (stopWords.has(token)) return []
    if (/^[\p{Script=Han}]+$/u.test(token) && token.length > 4) {
      return Array.from({ length: token.length - 1 }, (_, index) => token.slice(index, index + 2)).filter(
        (entry) => !stopWords.has(entry),
      )
    }

    return [token]
  })
}

const cosine = (left: Vector, right: Vector) => {
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  left.forEach((value, token) => {
    dot += value * (right.get(token) ?? 0)
    leftNorm += value ** 2
  })
  right.forEach((value) => {
    rightNorm += value ** 2
  })

  if (leftNorm === 0 || rightNorm === 0) return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

const averageVectors = (vectors: Vector[]) => {
  const averaged: Vector = new Map()
  if (vectors.length === 0) return averaged

  vectors.forEach((vector) => {
    vector.forEach((value, token) => {
      averaged.set(token, (averaged.get(token) ?? 0) + value / vectors.length)
    })
  })

  return averaged
}

const topTerms = (scores: Map<string, number>, limit: number) =>
  Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([term]) => term)

const summarize = (text: string) => (text.length > 90 ? `${text.slice(0, 90)}...` : text)

export const berTopicPlugin: ModelPlugin = {
  id: 'bertopic',
  name: '主题模型',
  nodeLabel: '主题模型',
  panelLabel: 'BERTopic',
  resultLabel: '主题摘要',
  description: 'BERTopic 风格文本主题发现：根据文本相似度聚类，并输出每个主题的关键词和代表文本。',
  methodLabel: 'BERTopic-style',
  shortName: 'BERTopic',
  fullName: 'Bidirectional Encoder Representations Topic Model',
  category: '文本分析',
  keywords: ['bertopic', 'topic', 'topic model', 'nlp', '主题模型', '文本分析', '聚类'],
  maturity: {
    level: 'preview',
    label: '预览',
    description: '桌面端优先调用 Python BERTopic 专业后端；Web 环境会降级为浏览器内探索版。',
  },
  limitations: ['需要桌面端和 Python 依赖才能使用完整 BERTopic；Web 环境仍使用 TF-IDF 聚类 fallback。'],
  requiresTarget: false,
  targetLabel: '',
  featuresLabel: '文本字段',
  downloadName: 'bertopic-report.csv',
  supportsCategoricalFeatures: false,
  supportedFeatureTypes: ['text', 'category'],

  getDefaultConfig(featureColumns) {
    return {
      target: '',
      features: featureColumns.slice(0, 1),
    }
  },

  sanitizeConfig(config, featureColumns) {
    const features = config.features.filter((feature) => featureColumns.includes(feature)).slice(0, 1)

    return {
      target: '',
      features: features.length > 0 ? features : featureColumns.slice(0, 1),
    }
  },

  getFormula(config) {
    return config.features[0] ? `bertopic ${config.features[0]}` : 'bertopic text_column'
  },

  getSettings(config) {
    return [
      { label: '文本字段', value: config.features[0] || '未选择' },
      { label: '主题数', value: '自动' },
      { label: '关键词方法', value: 'c-TF-IDF' },
    ]
  },

  fit({ rows, config }) {
    const textColumn = config.features[0]
    if (!textColumn) {
      throw new Error('请选择一个文本字段用于 BERTopic 主题建模。')
    }

    const documents = rows
      .map((row, index) => ({ index: index + 1, text: String(row[textColumn] ?? '').trim() }))
      .filter((document) => document.text.length > 0)

    if (documents.length < 3) {
      throw new Error('BERTopic 至少需要 3 条非空文本。')
    }

    const tokenized = documents.map((document) => tokenize(document.text))
    const documentFrequency = new Map<string, number>()
    tokenized.forEach((tokens) => {
      new Set(tokens).forEach((token) => {
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
      })
    })

    const vectors = tokenized.map((tokens) => {
      const counts = new Map<string, number>()
      tokens.forEach((token) => counts.set(token, (counts.get(token) ?? 0) + 1))

      const vector: Vector = new Map()
      counts.forEach((count, token) => {
        const idf = Math.log((documents.length + 1) / ((documentFrequency.get(token) ?? 0) + 1)) + 1
        vector.set(token, (count / Math.max(tokens.length, 1)) * idf)
      })

      return vector
    })

    const topicCount = Math.min(8, Math.max(2, Math.round(Math.sqrt(documents.length))))
    let centroids = vectors
      .map((vector, index) => ({ vector, index, weight: Array.from(vector.values()).reduce((sum, value) => sum + value, 0) }))
      .sort((left, right) => right.weight - left.weight)
      .slice(0, topicCount)
      .map((entry) => new Map(entry.vector))

    let assignments = vectors.map((_, index) => index % topicCount)
    for (let iteration = 0; iteration < 8; iteration += 1) {
      assignments = vectors.map((vector) => {
        const scores = centroids.map((centroid, topic) => ({ topic, score: cosine(vector, centroid) }))
        return scores.sort((left, right) => right.score - left.score)[0]?.topic ?? 0
      })

      centroids = centroids.map((centroid, topic) => {
        const topicVectors = vectors.filter((_, index) => assignments[index] === topic)
        return topicVectors.length > 0 ? averageVectors(topicVectors) : centroid
      })
    }

    const nonEmptyTopics = Array.from({ length: topicCount }, (_, topic) => topic).filter((topic) =>
      assignments.some((assignment) => assignment === topic),
    )
    const topicMap = new Map(nonEmptyTopics.map((topic, index) => [topic, index + 1]))
    const topicRows = nonEmptyTopics.map((topic) => {
      const documentIndexes = assignments.flatMap((assignment, index) => (assignment === topic ? [index] : []))
      const termScores = new Map<string, number>()
      documentIndexes.forEach((documentIndex) => {
        tokenized[documentIndex].forEach((token) => {
          const idf = Math.log((documents.length + 1) / ((documentFrequency.get(token) ?? 0) + 1)) + 1
          termScores.set(token, (termScores.get(token) ?? 0) + idf)
        })
      })

      const keywords = topTerms(termScores, 8).join(', ')
      const representativeIndex = documentIndexes
        .map((documentIndex) => ({ documentIndex, score: cosine(vectors[documentIndex], centroids[topic]) }))
        .sort((left, right) => right.score - left.score)[0]?.documentIndex

      return {
        topic: topicMap.get(topic) ?? topic + 1,
        documents: documentIndexes.length,
        share: documentIndexes.length / documents.length,
        keywords,
        representative: representativeIndex === undefined ? '' : summarize(documents[representativeIndex].text),
      }
    })

    const documentRows = documents.slice(0, 120).map((document, index) => {
      const topic = assignments[index]

      return {
        document: document.index,
        topic: topicMap.get(topic) ?? topic + 1,
        score: cosine(vectors[index], centroids[topic]),
        text: summarize(document.text),
      }
    })

    const largestTopic = topicRows.reduce((max, row) => Math.max(max, row.documents), 0)

    return {
      id: this.id,
      summary: [
        { label: 'documents', value: documents.length },
        { label: 'topics', value: topicRows.length },
        { label: 'largest topic', value: largestTopic },
        { label: 'text field', value: textColumn },
      ],
      tables: [
        {
          id: 'topics',
          title: '主题摘要',
          columns: topicColumns,
          rows: topicRows,
        },
        {
          id: 'documents',
          title: '文档主题分配',
          columns: documentColumns,
          rows: documentRows,
        },
      ],
      diagnostics: [],
      message: '当前为浏览器内 BERTopic 风格实现：使用 TF-IDF 文本向量、余弦聚类和类 c-TF-IDF 关键词。',
    } satisfies ModelResult
  },

  exportCsv(result, config) {
    return [
      ...csvSummarySection(this.getFormula(config), result.summary),
      ...result.tables.flatMap((table) => ['', ...csvTableSection(table)]),
    ].join('\n')
  },
}
