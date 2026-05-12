import { describe, expect, it } from 'vitest'
import { buildPublicationTableHtml, publicationSheetData, publicationTableCss } from './publicationRenderers'
import type { PublicationTable } from './publicationTables'

const table: PublicationTable = {
  kind: 'custom',
  title: '表 1：基准回归结果',
  sheetName: '论文三线表',
  columns: [
    { id: 'm1', label: '(1)' },
    { id: 'm2', label: '(2)' },
  ],
  rows: [
    { role: 'title', label: '表 1：基准回归结果', values: ['', ''] },
    { role: 'model', label: 'Model', values: ['OLS', 'OLS'] },
    { role: 'columnIndex', label: 'Variables', values: ['(1)', '(2)'] },
    { role: 'coefficient', label: 'TOOLA', values: ['1.23***', '1.45***'] },
    { role: 'statistic', label: '', values: ['(2.10)', '(2.40)'] },
    { role: 'metric', label: 'N', values: ['3,336', '3,210'] },
  ],
  notes: ['注：稳健标准误；括号内为 t 值。'],
  merges: [{ rowIndex: 0, columnIndex: 0, columnSpan: 3 }],
}

describe('publication renderers', () => {
  it('exports the shared three-line table css', () => {
    expect(publicationTableCss).toContain('.three-line')
    expect(publicationTableCss).toContain('Times New Roman')
  })

  it('renders merged html cells and escapes content', () => {
    const html = buildPublicationTableHtml({
      ...table,
      rows: [{ role: 'title', label: 'A & B', values: ['', ''] }, ...table.rows.slice(1)],
    })

    expect(html).toContain('colspan="3"')
    expect(html).toContain('A &amp; B')
    expect(html).toContain('<figcaption class="note">注：稳健标准误；括号内为 t 值。</figcaption>')
  })

  it('builds Excel sheet data with merge spans and hidden cells', () => {
    const data = publicationSheetData(table)

    expect(data[0]?.[0]).toMatchObject({
      value: '表 1：基准回归结果',
      columnSpan: 3,
      fontWeight: 'bold',
      align: 'center',
    })
    expect(data[0]?.[1]).toBeNull()
    expect(data[2]?.[0]).toMatchObject({
      value: 'Variables',
      bottomBorderStyle: 'thin',
    })
    expect(data.at(-1)?.[0]).toMatchObject({
      value: '注：稳健标准误；括号内为 t 值。',
    })
  })
})
