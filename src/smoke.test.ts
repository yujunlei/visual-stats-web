import { describe, expect, it } from 'vitest'
import { createImportPlan, defaultPrepConfig } from './hooks/useWorkbenchSession'
import { deriveResultInsights } from './components/results/resultInsights'
import { emptyDataRoles } from './data/dataRoles'
import { profileRows } from './data/tableUtils'
import type { Row } from './data/types'
import { buildBaselinePublicationTable } from './export/publicationTables'
import { buildCsvReport, buildHtmlReport } from './export/reportExport'
import { getModelMaturity, getModelPlugin } from './models/registry'
import { runModelTask } from './workers/runModelTask'

describe('core modeling smoke flow', () => {
  it('cleans imported rows, configures and runs a model, derives insights, and exports a publication table', () => {
    const rawRows: Row[] = [
      { y: 1.1, x: 0 },
      { y: 3.0, x: 1 },
      { y: 5.2, x: 2 },
      { y: 6.9, x: 3 },
      { y: 9.1, x: 4 },
      { y: 11.0, x: 5 },
      { y: 13.2, x: 6 },
      { y: 14.9, x: 7 },
      { y: '', x: '' },
    ]

    const importPlan = createImportPlan(rawRows, 'smoke.csv')

    expect(importPlan.kind).toBe('ready')
    if (importPlan.kind !== 'ready') return
    expect(importPlan.pendingImport.rows).toHaveLength(8)

    const model = getModelPlugin('linear-regression')
    const profiles = profileRows(importPlan.pendingImport.rows)
    const config = model.sanitizeConfig(
      { target: 'y', features: ['x'], params: { target: 'y', features: ['x'], controls: [] } },
      profiles.map((profile) => profile.name),
      profiles.filter((profile) => profile.type === 'numeric').map((profile) => profile.name),
    )

    expect(config).toMatchObject({ target: 'y', features: ['x'] })
    expect(config.params?.controls).toEqual([])

    const { result, logs } = runModelTask(
      {
        taskId: 'smoke-run',
        modelId: model.id,
        rows: importPlan.pendingImport.rows,
        profiles,
        config,
        prepConfig: defaultPrepConfig,
        inference: { standardError: 'ols', clusterField: '' },
      },
      () => undefined,
    )

    expect(result.id).toBe('linear-regression')
    expect(result.tables.some((table) => table.id === 'coefficients')).toBe(true)
    expect(logs.length).toBeGreaterThan(0)

    const insights = deriveResultInsights(result)
    expect(insights.length).toBeGreaterThan(0)
    expect(insights.some((insight) => insight.includes('有效观测'))).toBe(true)

    const publicationTable = buildBaselinePublicationTable({
      result,
      config,
      dimensions: emptyDataRoles,
      modelLabel: model.shortName,
      methodLabel: model.methodLabel,
    })

    expect(publicationTable?.kind).toBe('baseline')
    expect(publicationTable?.rows.some((row) => row.label === 'x')).toBe(true)

    const reportContext = {
      result,
      config,
      selectedIds: ['summary', 'table:coefficients', 'three-line'],
      model: {
        id: model.id,
        name: model.name,
        shortName: model.shortName,
        formula: model.getFormula(config),
        downloadName: model.downloadName,
      },
      maturity: getModelMaturity(model),
      runLogs: logs,
      baselinePublicationTable: publicationTable,
      customPublicationTable: null,
    }

    expect(buildHtmlReport(reportContext)).toContain('基准回归结果')
    expect(buildCsvReport(reportContext)).toContain('回归结果')
  })
})
