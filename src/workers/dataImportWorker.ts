import Papa from 'papaparse'
import { readSheet } from 'read-excel-file/web-worker'
import type { Row } from '../data/types'
import { rowsFromSheet } from '../data/tableUtils'
import { dataImportLimits, type DataImportWorkerMessage, type DataImportWorkerRequest } from './dataImportWorkerTypes'

const postMessageToMain = (message: DataImportWorkerMessage) => {
  self.postMessage(message)
}

const rowLimitError = () => `数据行数过多：当前限制为 ${dataImportLimits.maxRows.toLocaleString('zh-CN')} 行。`
const columnLimitError = () => `字段数过多：当前限制为 ${dataImportLimits.maxColumns.toLocaleString('zh-CN')} 个字段。`

const getMaxSheetColumnCount = (sheetRows: unknown[][]) => {
  let maxColumns = 0
  for (const row of sheetRows) {
    if (row.length > maxColumns) maxColumns = row.length
  }
  return maxColumns
}

const getMaxRowColumnCount = (rows: Row[]) => {
  let maxColumns = 0
  for (const row of rows) {
    const columnCount = Object.keys(row).length
    if (columnCount > maxColumns) maxColumns = columnCount
  }
  return maxColumns
}

const parseCsv = (taskId: string, file: File) =>
  new Promise<Row[]>((resolve, reject) => {
    const rows: Row[] = []
    let settled = false
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      chunk: ({ data, meta }, parser) => {
        const nextRows = data.filter((row) => Object.keys(row).length > 0)
        const nextColumnCount = Math.max(...nextRows.map((row) => Object.keys(row).length), Object.keys(rows[0] ?? {}).length, 0)
        if (nextColumnCount > dataImportLimits.maxColumns) {
          settled = true
          parser.abort()
          reject(new Error(columnLimitError()))
          return
        }
        if (rows.length + nextRows.length > dataImportLimits.maxRows) {
          settled = true
          parser.abort()
          reject(new Error(rowLimitError()))
          return
        }
        rows.push(...nextRows)
        const progress = file.size > 0 && meta.cursor ? Math.min(95, Math.round((meta.cursor / file.size) * 95)) : 50
        postMessageToMain({ type: 'progress', taskId, phase: '正在解析 CSV 数据。', progress })
      },
      complete: () => {
        if (!settled) resolve(rows)
      },
      error: () => {
        if (!settled) reject(new Error('CSV 解析失败，请检查文件格式。'))
      },
    })
  })

const parseXlsx = async (taskId: string, file: File) => {
  postMessageToMain({ type: 'progress', taskId, phase: '正在读取 XLSX 工作表。', progress: 20 })
  const sheetRows = await readSheet(file)
  if (sheetRows.length > dataImportLimits.maxRows + 1) {
    throw new Error(rowLimitError())
  }
  if (getMaxSheetColumnCount(sheetRows) > dataImportLimits.maxColumns) {
    throw new Error(columnLimitError())
  }

  postMessageToMain({ type: 'progress', taskId, phase: '正在转换 XLSX 行数据。', progress: 75 })
  const rows = rowsFromSheet(sheetRows)
  if (rows.length > dataImportLimits.maxRows) {
    throw new Error(rowLimitError())
  }
  if (getMaxRowColumnCount(rows) > dataImportLimits.maxColumns) {
    throw new Error(columnLimitError())
  }
  return rows
}

self.onmessage = async (event: MessageEvent<DataImportWorkerRequest>) => {
  const { taskId, file, fileType } = event.data
  try {
    const rows = fileType === 'xlsx' ? await parseXlsx(taskId, file) : await parseCsv(taskId, file)
    postMessageToMain({ type: 'success', taskId, rows })
  } catch (error) {
    const fallback = fileType === 'xlsx' ? 'XLSX 解析失败，请确认第一张工作表是标准二维表。' : 'CSV 解析失败，请检查文件格式。'
    postMessageToMain({ type: 'error', taskId, error: error instanceof Error && error.message ? error.message : fallback })
  }
}
