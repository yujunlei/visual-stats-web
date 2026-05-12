import type { Cell, SheetData } from 'write-excel-file/browser'
import { publicationTableToRows, type PublicationTable } from './publicationTables'

const escapeXml = (value: string | number) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const publicationTableCss = `
.publication-block{margin:18px 0 24px}
.publication-table{width:100%;border-collapse:collapse;table-layout:auto;margin:0;font-family:"Times New Roman","Noto Serif SC",serif;color:#000;background:#fff}
.three-line th,.three-line td{border:0;padding:2px 6px;font-size:12px;line-height:1.28;text-align:center;vertical-align:middle;background:#fff}
.three-line .row-label{text-align:left;white-space:nowrap}
.three-line .is-empty-label{color:transparent}
.three-line tr.row-role-title th{border-top:2px solid #000;border-bottom:2px solid #000;font-size:16px;font-weight:700;line-height:1.2;text-align:center;padding:3px 6px}
.three-line tr.row-role-model th,.three-line tr.row-role-group th{font-weight:400}
.three-line tr.is-last-header th{border-bottom:1.5px solid #000}
.three-line tr.row-role-coefficient td:first-child{font-weight:600}
.three-line tr.row-role-statistic td{padding-top:0;color:#000}
.three-line tr:last-child td,.three-line tr:last-child th{border-bottom:2px solid #000}
.three-line .is-centered{text-align:center}
.note{margin-top:4px;padding-top:0;border-top:0;font-size:12px;line-height:1.35;color:#000;font-family:"Times New Roman","Noto Serif SC",serif}
`

export function buildPublicationTableHtml(table: PublicationTable) {
  const mergeMap = new Map(table.merges.map((merge) => [`${merge.rowIndex}:${merge.columnIndex}`, merge.columnSpan]))
  const hiddenCells = new Set<string>()
  table.merges.forEach((merge) => {
    for (let offset = 1; offset < merge.columnSpan; offset += 1) hiddenCells.add(`${merge.rowIndex}:${merge.columnIndex + offset}`)
  })
  const rows = table.rows
    .map((row, rowIndex) => {
      const values = [row.label, ...row.values]
      const nextRole = table.rows[rowIndex + 1]?.role
      const isHeaderEnd = (row.role === 'header' || row.role === 'columnIndex') && nextRole !== 'header' && nextRole !== 'columnIndex'
      const rowClassNames = [`row-role-${row.role}`, isHeaderEnd ? 'is-last-header' : ''].filter(Boolean).join(' ')
      const cells = values
        .map((cell, cellIndex) => {
          if (hiddenCells.has(`${rowIndex}:${cellIndex}`)) return ''
          const tag = row.role === 'title' || row.role === 'model' || row.role === 'group' || row.role === 'header' || row.role === 'columnIndex' ? 'th' : 'td'
          const classNames = [
            cellIndex === 0 ? 'row-label' : '',
            `row-role-${row.role}`,
            row.role === 'statistic' && cellIndex === 0 ? 'is-empty-label' : '',
            cellIndex > 0 ? 'is-centered' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const span = mergeMap.get(`${rowIndex}:${cellIndex}`)
          return `<${tag}${classNames ? ` class="${classNames}"` : ''}${span ? ` colspan="${span}"` : ''}>${escapeXml(cell)}</${tag}>`
        })
        .join('')
      return `<tr class="${rowClassNames}">${cells}</tr>`
    })
    .join('')

  const note = table.notes.join(' ')
  return `<figure class="publication-block"><table class="three-line publication-table"><tbody>${rows}</tbody></table><figcaption class="note">${escapeXml(note)}</figcaption></figure>`
}

export const excelCell = (
  value: string | number,
  style: Partial<Extract<Cell, { value?: unknown }>> = {},
): Cell => ({
  value,
  type: typeof value === 'number' ? Number : String,
  align: typeof value === 'number' ? 'right' : 'left',
  ...style,
})

export const publicationSheetData = (table: PublicationTable): SheetData => {
  const rows = publicationTableToRows(table, { includeNotes: true })
  const hiddenCells = new Set<string>()
  const mergeStarts = new Map<string, number>()

  table.merges.forEach((merge) => {
    mergeStarts.set(`${merge.rowIndex}:${merge.columnIndex}`, merge.columnSpan)
    for (let offset = 1; offset < merge.columnSpan; offset += 1) hiddenCells.add(`${merge.rowIndex}:${merge.columnIndex + offset}`)
  })

  return rows.map((row, rowIndex) =>
    row.map((cell, columnIndex) => {
      if (hiddenCells.has(`${rowIndex}:${columnIndex}`)) return null
      const role = rowIndex < table.rows.length ? table.rows[rowIndex].role : 'note'
      const nextRole = table.rows[rowIndex + 1]?.role
      const isHeader = role === 'title' || role === 'model' || role === 'group' || role === 'header' || role === 'columnIndex'
      const isStatistic = role === 'statistic'
      const isNote = role === 'note'
      const isTitleRow = role === 'title'
      const isHeaderEnd = (role === 'header' || role === 'columnIndex') && nextRole !== 'header' && nextRole !== 'columnIndex'
      const isLastTableRow = rowIndex === table.rows.length - 1
      const isCoefficientLabel = role === 'coefficient' && columnIndex === 0
      return excelCell(cell, {
        fontFamily: 'Times New Roman',
        fontSize: isTitleRow ? 14 : isNote ? 11 : 12,
        fontWeight: isTitleRow || isHeader || isCoefficientLabel ? 'bold' : undefined,
        align: isTitleRow || role === 'model' || role === 'group' || columnIndex > 0 ? 'center' : 'left',
        wrap: true,
        columnSpan: mergeStarts.get(`${rowIndex}:${columnIndex}`),
        backgroundColor: '#ffffff',
        topBorderStyle: isTitleRow ? 'medium' : undefined,
        bottomBorderStyle: isTitleRow || isLastTableRow ? 'medium' : isHeaderEnd ? 'thin' : undefined,
        leftBorderStyle: undefined,
        rightBorderStyle: undefined,
        textColor: '#000000',
        alignVertical: 'center',
        height: isTitleRow ? 22 : role === 'model' || role === 'group' || isHeaderEnd ? 17 : isNote ? 18 : isStatistic ? 15 : 18,
      })
    }),
  )
}
