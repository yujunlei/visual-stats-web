import writeXlsxFile, { type Sheet, type SheetData } from 'write-excel-file/browser'
import type { RunLogEntry } from '../data/preprocess'
import type { ModelConfig, ModelResult } from '../models/types'
import { columnLabels, formatMetricValue, formatResultValue } from '../components/results/resultFormat'
import { buildPublicationTableHtml, excelCell, publicationSheetData, publicationTableCss } from './publicationRenderers'
import { publicationTableToRows, type PublicationTable } from './publicationTables'

export type ReportExportContext = {
  result: ModelResult
  config: ModelConfig
  selectedIds: string[]
  model: {
    id: string
    name: string
    shortName: string
    formula: string
    downloadName: string
  }
  maturity: {
    label: string
    description: string
  }
  runLogs: RunLogEntry[]
  baselinePublicationTable: PublicationTable | null
  customPublicationTable: PublicationTable | null
}

export const csvCell = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const csvLine = (values: Array<string | number | null | undefined>) => values.map(csvCell).join(',')

const escapeXml = (value: string | number) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const getSelectedResultTables = (result: ModelResult, selectedIds: string[]) =>
  [...result.tables.filter((table) => selectedIds.includes(`table:${table.id}`))].sort((left, right) => {
    if (left.id === 'coefficients') return -1
    if (right.id === 'coefficients') return 1
    return 0
  })

export const buildStataRows = (result: ModelResult) => {
  const coefficientTable = result.tables.find((table) => table.id === 'coefficients')
  if (!coefficientTable) return []

  return [
    ['Variable', 'Coef.', 'Std. err.', 'P>|t|'],
    ...coefficientTable.rows.map((row) => [
      String(row.term ?? row.variable ?? ''),
      formatResultValue(row.coefficient ?? '', 'coefficient'),
      row.stdError === undefined ? '' : formatResultValue(row.stdError, 'stdError'),
      row.pValue === undefined ? '' : formatResultValue(row.pValue, 'pValue'),
    ]),
  ]
}

const buildStataStyleTable = ({ result, selectedIds }: ReportExportContext) => {
  if (!selectedIds.includes('stata')) return ''
  const coefficientTable = result.tables.find((table) => table.id === 'coefficients')
  if (!coefficientTable) return ''
  const rows = coefficientTable.rows.map((row) => {
    const term = String(row.term ?? row.variable ?? '')
    const coefficient = formatResultValue(row.coefficient as string | number, 'coefficient')
    const stdError = row.stdError === undefined ? '' : `(${formatResultValue(row.stdError as string | number, 'stdError')})`
    const pValue = row.pValue === undefined ? '' : formatResultValue(row.pValue as string | number, 'pValue')
    return `<tr><td>${escapeXml(term)}</td><td>${escapeXml(coefficient)}</td><td>${escapeXml(stdError)}</td><td>${escapeXml(pValue)}</td></tr>`
  })

  return `<h2>Stata 风格回归表</h2><table><thead><tr><th>Variable</th><th>Coef.</th><th>Std. err.</th><th>P>|t|</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}

const buildThreeLineTable = ({ selectedIds, baselinePublicationTable }: ReportExportContext) =>
  selectedIds.includes('three-line') && baselinePublicationTable ? buildPublicationTableHtml(baselinePublicationTable) : ''

export const buildHtmlReport = (context: ReportExportContext) => {
  const { result, selectedIds, model, maturity, runLogs, config, customPublicationTable } = context
  const tableHtml = getSelectedResultTables(result, selectedIds)
    .map(
      (table) =>
        `<h2>${escapeXml(table.title)}</h2><table><thead><tr>${table.columns
          .map((column) => `<th>${escapeXml(columnLabels[column] ?? column)}</th>`)
          .join('')}</tr></thead><tbody>${table.rows
          .map((row) => `<tr>${table.columns.map((column) => `<td>${escapeXml(formatResultValue(row[column] ?? '', column))}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
    )
    .join('')
  const summaryRows = selectedIds.includes('summary')
    ? `<h2>模型摘要</h2><table>${result.summary.map((metric) => `<tr><td>${escapeXml(metric.label)}</td><td>${escapeXml(formatMetricValue(metric))}</td></tr>`).join('')}</table>`
    : ''
  const logRows = selectedIds.includes('logs')
    ? `<h2>运行日志</h2><table><thead><tr><th>Level</th><th>Message</th></tr></thead><tbody>${runLogs.map((entry) => `<tr><td>${escapeXml(entry.level)}</td><td>${escapeXml(entry.message)}</td></tr>`).join('')}</tbody></table>`
    : ''
  const configBlock = selectedIds.includes('config') ? `<h2>参数配置 JSON</h2><pre>${escapeXml(JSON.stringify(config, null, 2))}</pre>` : ''
  const customPublicationHtml = selectedIds.includes('custom-publication') && customPublicationTable ? buildPublicationTableHtml(customPublicationTable) : ''

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(model.name)} 报告</title><style>
body{font-family:"Times New Roman","Noto Serif SC",serif;color:#1a1f26;margin:28px;line-height:1.65}h1{font-size:22px}h2{font-size:16px;margin:22px 0 8px}table{border-collapse:collapse;width:100%;margin:8px 0 14px}th,td{border:1px solid #d9ddd6;padding:6px 8px;font-size:12px;text-align:left}th{background:#f4f6f2}code{white-space:pre-wrap}${publicationTableCss}
</style></head><body><h1>${escapeXml(model.name)}（${escapeXml(model.shortName)}）</h1><p><strong>公式：</strong><code>${escapeXml(model.formula)}</code></p><p><strong>可信度：</strong>${escapeXml(maturity.label)} · ${escapeXml(maturity.description)}</p>${summaryRows}${buildStataStyleTable(context)}${buildThreeLineTable(context)}${customPublicationHtml}${tableHtml}${logRows}${configBlock}</body></html>`
}

const worksheetNameFactory = () => {
  const worksheetNames = new Set<string>()

  return (name: string) => {
    const base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet'
    let nextName = base
    let index = 2
    while (worksheetNames.has(nextName)) {
      const suffix = ` ${index}`
      nextName = `${base.slice(0, 31 - suffix.length)}${suffix}`
      index += 1
    }
    worksheetNames.add(nextName)
    return nextName
  }
}

const asSheetData = (rows: Array<Array<string | number>>): SheetData =>
  rows.map((row, rowIndex) =>
    row.map((cell, columnIndex) => {
      const isHeader = rowIndex === 0
      return excelCell(cell, {
        fontFamily: 'Times New Roman',
        fontSize: 11,
        fontWeight: isHeader ? 'bold' : undefined,
        align: columnIndex > 0 ? 'center' : 'left',
        wrap: true,
      })
    }),
  )

const tableRows = (table: ModelResult['tables'][number]) => [
  table.columns.map((column) => columnLabels[column] ?? column),
  ...table.rows.map((row) => table.columns.map((column) => formatResultValue(row[column] ?? '', column))),
]

export const buildExcelBlob = async (context: ReportExportContext) => {
  const { result, selectedIds, runLogs, config, baselinePublicationTable, customPublicationTable } = context
  const worksheetName = worksheetNameFactory()
  const sheets: Sheet<Blob>[] = []
  const appendSheet = (name: string, rows: Array<Array<string | number>>) => {
    const columnCount = Math.max(...rows.map((row) => row.length), 1)
    sheets.push({
      sheet: worksheetName(name),
      data: asSheetData(rows),
      columns: Array.from({ length: columnCount }, (_, columnIndex) => ({ width: columnIndex === 0 ? 18 : 13 })),
      showGridLines: true,
    })
  }
  const appendPublicationSheet = (table: PublicationTable) => {
    const columnCount = table.columns.length + 1
    const labelWidth = Math.min(26, Math.max(18, Math.max(...table.rows.map((row) => row.label.length), 10) * 1.45))
    const valueWidth = Math.min(
      18,
      Math.max(
        11,
        ...table.rows.flatMap((row) => row.values.map((value) => String(value ?? '').length * 1.18)),
      ),
    )
    sheets.push({
      sheet: worksheetName(table.sheetName),
      data: publicationSheetData(table),
      columns: Array.from({ length: columnCount }, (_, columnIndex) => ({ width: columnIndex === 0 ? labelWidth : valueWidth })),
      showGridLines: false,
    })
  }

  if (selectedIds.includes('summary')) appendSheet('模型摘要', [['Metric', 'Value'], ...result.summary.map((metric) => [metric.label, formatMetricValue(metric)])])
  getSelectedResultTables(result, selectedIds).forEach((table) => appendSheet(table.id === 'coefficients' ? '回归结果' : table.title, tableRows(table)))
  if (selectedIds.includes('stata')) appendSheet('Stata回归表', buildStataRows(result))
  if (selectedIds.includes('three-line') && baselinePublicationTable) appendPublicationSheet(baselinePublicationTable)
  if (selectedIds.includes('custom-publication') && customPublicationTable) appendPublicationSheet(customPublicationTable)
  if (selectedIds.includes('logs')) appendSheet('运行日志', [['Level', 'Message'], ...runLogs.map((entry) => [entry.level, entry.message])])
  if (selectedIds.includes('config')) appendSheet('参数配置', [['JSON'], [JSON.stringify(config, null, 2)]])

  return writeXlsxFile(sheets, { fontFamily: 'Times New Roman', fontSize: 11 }).toBlob()
}

export const buildCsvReport = (context: ReportExportContext) => {
  const { result, selectedIds, model, runLogs, config, baselinePublicationTable, customPublicationTable } = context
  const lines: string[] = []
  if (selectedIds.includes('summary')) {
    lines.push('模型摘要', csvLine(['字段', '值']), csvLine(['Model', model.formula]))
    result.summary.forEach((metric) => lines.push(csvLine([metric.label, formatMetricValue(metric)])))
  }
  getSelectedResultTables(result, selectedIds).forEach((table) => {
    lines.push('', table.id === 'coefficients' ? '回归结果' : table.title, csvLine(table.columns.map((column) => columnLabels[column] ?? column)))
    table.rows.forEach((row) => lines.push(csvLine(table.columns.map((column) => formatResultValue(row[column] ?? '', column)))))
  })
  if (selectedIds.includes('stata')) {
    lines.push('', 'Stata 风格回归表', ...buildStataRows(result).map((row) => csvLine(row)))
  }
  if (selectedIds.includes('three-line') && baselinePublicationTable) {
    if (lines.length > 0) lines.push('')
    const publicationRows = publicationTableToRows(baselinePublicationTable, { includeNotes: true })
    const note = String(publicationRows.at(-1)?.[0] ?? '')
    lines.push(...publicationRows.slice(0, -1).map((row) => csvLine(row)), '', note)
  }
  if (selectedIds.includes('custom-publication') && customPublicationTable) {
    if (lines.length > 0) lines.push('')
    const publicationRows = publicationTableToRows(customPublicationTable, { includeNotes: true })
    const note = String(publicationRows.at(-1)?.[0] ?? '')
    lines.push(...publicationRows.slice(0, -1).map((row) => csvLine(row)), '', note)
  }
  if (selectedIds.includes('logs')) {
    lines.push('', '运行日志', csvLine(['Level', 'Message']), ...runLogs.map((entry) => csvLine([entry.level, entry.message])))
  }
  if (selectedIds.includes('config')) {
    lines.push('', '参数配置 JSON', csvLine(['JSON']), csvLine([JSON.stringify(config, null, 2)]))
  }
  return lines.join('\n')
}

export const buildJsonReport = (context: ReportExportContext) => {
  const { result, selectedIds, model, config, runLogs, customPublicationTable } = context
  return JSON.stringify(
    {
      modelId: model.id,
      formula: model.formula,
      selected: selectedIds,
      config: selectedIds.includes('config') ? config : undefined,
      summary: selectedIds.includes('summary') ? result.summary : undefined,
      tables: getSelectedResultTables(result, selectedIds),
      customPublication: selectedIds.includes('custom-publication') ? customPublicationTable : undefined,
      logs: selectedIds.includes('logs') ? runLogs : undefined,
    },
    null,
    2,
  )
}
