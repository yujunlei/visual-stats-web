import { describe, expect, it } from 'vitest'
import type { ModelResult } from '../models/types'
import { buildCsvReport, buildHtmlReport, buildJsonReport, buildStataRows, csvLine, getSelectedResultTables, type ReportExportContext } from './reportExport'
import type { PublicationTable } from './publicationTables'

const result: ModelResult = {
  id: 'linear-regression',
  summary: [
    { label: 'Number of obs', value: 100 },
    { label: 'R-squared', value: 0.42 },
  ],
  tables: [
    {
      id: 'diagnostics',
      title: '诊断',
      columns: ['name', 'value'],
      rows: [{ name: 'A', value: 1 }],
    },
    {
      id: 'coefficients',
      title: '系数估计',
      columns: ['term', 'coefficient', 'stdError', 'pValue'],
      rows: [{ term: 'x', coefficient: 1.23, stdError: 0.12, pValue: 0.01 }],
    },
  ],
  diagnostics: [],
  message: '',
}

const publicationTable: PublicationTable = {
  kind: 'baseline',
  title: '表 1：基准回归结果',
  sheetName: '论文三线表',
  columns: [{ id: 'm1', label: '(1)' }],
  rows: [
    { role: 'title', label: '表 1：基准回归结果', values: [''] },
    { role: 'model', label: 'Model', values: ['OLS'] },
    { role: 'columnIndex', label: 'Variables', values: ['(1)'] },
    { role: 'coefficient', label: 'x', values: ['1.23***'] },
  ],
  notes: ['注：稳健标准误。'],
  merges: [{ rowIndex: 0, columnIndex: 0, columnSpan: 2 }],
}

const context = (selectedIds: string[]): ReportExportContext => ({
  result,
  config: { target: 'y', features: ['x'], params: {} },
  selectedIds,
  model: {
    id: 'linear-regression',
    name: '线性回归',
    shortName: 'OLS',
    formula: 'y ~ x',
    downloadName: 'linear.csv',
  },
  maturity: {
    label: '稳定',
    description: '测试说明',
  },
  runLogs: [{ level: 'info', message: 'done' }],
  baselinePublicationTable: publicationTable,
  customPublicationTable: null,
})

describe('report export builders', () => {
  it('escapes CSV cells', () => {
    expect(csvLine(['A,B', 'C"D', null])).toBe('"A,B","C""D",')
  })

  it('guards CSV exports against spreadsheet formula injection', () => {
    expect(csvLine(['=cmd()', '+SUM(A1:A2)', '-10', '@payload', '\t=hidden', '\r=hidden'])).toBe(
      "'=cmd(),'+SUM(A1:A2),'-10,'@payload,'\t=hidden,\"'\r=hidden\"",
    )
  })

  it('selects coefficient tables before secondary tables', () => {
    expect(getSelectedResultTables(result, ['table:diagnostics', 'table:coefficients']).map((table) => table.id)).toEqual([
      'coefficients',
      'diagnostics',
    ])
  })

  it('builds Stata-style coefficient rows', () => {
    expect(buildStataRows(result)).toEqual([
      ['Variable', 'Coef.', 'Std. err.', 'P>|t|'],
      ['x', '1.23', '0.12', '0.010'],
    ])
  })

  it('builds CSV, HTML, and JSON reports from the same context', () => {
    const selectedIds = ['summary', 'table:coefficients', 'stata', 'three-line', 'logs', 'config']

    expect(buildCsvReport(context(selectedIds))).toContain('Stata 风格回归表')
    expect(buildCsvReport(context(selectedIds))).toContain('表 1：基准回归结果')

    const html = buildHtmlReport(context(selectedIds))
    expect(html).toContain('<h1>线性回归（OLS）</h1>')
    expect(html).toContain('表 1：基准回归结果')

    const json = JSON.parse(buildJsonReport(context(selectedIds))) as { modelId: string; selected: string[]; config?: unknown; logs?: unknown[] }
    expect(json.modelId).toBe('linear-regression')
    expect(json.selected).toEqual(selectedIds)
    expect(json.config).toBeDefined()
    expect(json.logs).toHaveLength(1)
  })
})
