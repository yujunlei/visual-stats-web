import type { ModelMetric, ModelResultTable } from '../types'

type CsvValue = string | number | null | undefined

export const csvCell = (value: CsvValue) => {
  if (value === null || value === undefined) return ''

  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const csvRow = (cells: CsvValue[]) => cells.map(csvCell).join(',')

export const csvSummarySection = (formula: string, summary: ModelMetric[]) => [
  '模型摘要',
  csvRow(['字段', '值']),
  csvRow(['Model', formula]),
  ...summary.map((metric) => csvRow([metric.label, metric.value])),
]

export const csvTableSection = (table: ModelResultTable) => [
  table.title,
  csvRow(table.columns),
  ...table.rows.map((row) => csvRow(table.columns.map((column) => row[column]))),
]
