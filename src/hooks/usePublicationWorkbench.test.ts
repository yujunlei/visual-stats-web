import { describe, expect, it } from 'vitest'
import { emptyDataRoles } from '../data/dataRoles'
import { defaultCustomPublicationConfig, type CustomPublicationConfig, type CustomPublicationTemplate } from '../export/customPublicationConfig'
import type { CustomPublicationDragItem } from '../export/customPublicationActions'
import type { CustomPublicationOption, CustomPublicationStatisticOption } from '../export/customPublicationOptions'
import type { CustomPublicationSource, PublicationTable } from '../export/publicationTables'
import type { ModelConfig, ModelPlugin, ModelResult } from '../models/types'
import {
  buildPublicationWorkbenchPreview,
  createPublicationWorkbenchActions,
  createPublicationWorkbenchBuilders,
  getPublicationTemplateStatus,
  resolveCleanDefaultTemplateId,
} from './usePublicationWorkbench'

const modelConfig: ModelConfig = { target: 'y', features: ['x', 'z'], params: {} }

const result: ModelResult = {
  id: 'linear-regression',
  summary: [
    { label: 'Number of obs', value: 120 },
    { label: 'R-squared', value: 0.48 },
  ],
  tables: [
    {
      id: 'coefficients',
      title: '系数估计',
      columns: ['term', 'coefficient', 'stdError', 'pValue'],
      rows: [
        { term: 'x', coefficient: 1.25, stdError: 0.3, pValue: 0.02 },
        { term: 'z', coefficient: -0.4, stdError: 0.2, pValue: 0.08 },
        { term: '_cons', coefficient: 0.5, stdError: 0.4, pValue: 0.25 },
      ],
    },
  ],
  diagnostics: [],
  message: 'done',
}

const activeModel: ModelPlugin = {
  id: 'linear-regression',
  name: '线性回归',
  nodeLabel: '线性回归',
  panelLabel: '线性回归',
  resultLabel: '线性回归',
  description: '',
  methodLabel: 'OLS',
  shortName: 'OLS',
  fullName: 'Ordinary Least Squares',
  category: '回归建模',
  keywords: [],
  requiresTarget: true,
  targetLabel: '因变量',
  featuresLabel: '自变量',
  downloadName: 'linear-regression',
  supportsCategoricalFeatures: true,
  getDefaultConfig: () => modelConfig,
  sanitizeConfig: (config) => config,
  getFormula: (config) => `${config.target} ~ ${config.features.join(' + ')}`,
  getSettings: () => [],
  fit: () => result,
  exportCsv: () => '',
}

const currentSource: CustomPublicationSource = {
  id: 'current',
  label: '当前结果 · 线性回归',
  result,
  config: modelConfig,
  dimensions: emptyDataRoles,
  modelName: '线性回归',
  modelShortName: 'OLS',
  formula: 'y ~ x + z',
}

const snapshotSource: CustomPublicationSource = {
  ...currentSource,
  id: 'snapshot:one',
  label: '稳健性结果',
}

const variableOptions: CustomPublicationOption[] = [
  { id: 'x', label: 'x' },
  { id: 'z', label: 'z' },
  { id: '_cons', label: 'Cons' },
]

const statisticOptions: CustomPublicationStatisticOption[] = [
  { id: 'controls', label: 'Controls', detail: '控制变量' },
  { id: 'n', label: 'N', detail: '样本量' },
  { id: 'adj-r2', label: 'Adj-R²', detail: '调整 R²' },
]

const applySetter = <TValue>(current: TValue, value: TValue | ((next: TValue) => TValue)) =>
  typeof value === 'function' ? (value as (next: TValue) => TValue)(current) : value

const createActionHarness = (overrides: Partial<{ config: CustomPublicationConfig; templates: CustomPublicationTemplate[]; defaultTemplateId: string }> = {}) => {
  let config = overrides.config ?? defaultCustomPublicationConfig()
  let templates = overrides.templates ?? []
  let defaultTemplateId = overrides.defaultTemplateId ?? ''
  let draggingItem: CustomPublicationDragItem | null = null
  let idCounter = 0

  const actions = () =>
    createPublicationWorkbenchActions({
      config,
      templates,
      defaultTemplateId,
      defaultSourceIds: ['current'],
      effectiveSourceIds: config.selectedSourceIds.length > 0 ? config.selectedSourceIds : ['current'],
      selectedSources: [currentSource, snapshotSource],
      variableOptions,
      orderedVariableOptions: variableOptions,
      statisticOptions,
      draggingItem,
      setConfig: (value) => {
        config = applySetter(config, value)
      },
      setTemplates: (value) => {
        templates = applySetter(templates, value)
      },
      setDefaultTemplateId: (value) => {
        defaultTemplateId = applySetter(defaultTemplateId, value)
      },
      setDraggingItem: (value) => {
        draggingItem = applySetter(draggingItem, value)
      },
      createId: () => {
        idCounter += 1
        return `id-${idCounter}`
      },
      getNow: () => '2026-05-12T00:00:00.000Z',
    })

  return {
    actions,
    get config() {
      return config
    },
    get templates() {
      return templates
    },
    get defaultTemplateId() {
      return defaultTemplateId
    },
    get draggingItem() {
      return draggingItem
    },
  }
}

describe('usePublicationWorkbench helpers', () => {
  it('keeps current-three-line mode on the baseline publication table', () => {
    const builders = createPublicationWorkbenchBuilders({
      result,
      hasActiveModel: true,
      activeModel,
      sanitizedConfig: modelConfig,
      dataRoles: emptyDataRoles,
      config: defaultCustomPublicationConfig(),
      isDefaultTableMode: true,
      selectedSources: [currentSource],
      orderedVariableOptions: variableOptions,
      statisticOptions,
      hiddenVariableIds: new Set(),
      disabledStatisticIds: new Set(),
    })

    const table = builders.buildCustomPublicationTable()

    expect(table?.kind).toBe('baseline')
    expect(table?.title).toBe('表 1：基准回归结果')
    expect(table?.columns).toEqual([{ id: 'OLS', label: '(1)' }])
  })

  it('switches to custom mode through startCustom', () => {
    const harness = createActionHarness()

    harness.actions().startCustom()

    expect(harness.config.mode).toBe('custom')
    expect(harness.config.selectedSourceIds).toEqual(['current'])
  })

  it('does not build preview table or html when the preview gate is disabled', () => {
    let tableBuildCount = 0
    let htmlBuildCount = 0
    const table: PublicationTable = {
      kind: 'custom',
      title: 'Preview',
      sheetName: 'Preview',
      columns: [],
      rows: [],
      notes: [],
      merges: [],
    }

    const disabled = buildPublicationWorkbenchPreview({
      isPreviewEnabled: false,
      hasPublicationSources: true,
      buildTable: () => {
        tableBuildCount += 1
        return table
      },
      buildHtml: () => {
        htmlBuildCount += 1
        return '<table />'
      },
    })

    expect(disabled).toEqual({ previewTable: null, previewHtml: '' })
    expect(tableBuildCount).toBe(0)
    expect(htmlBuildCount).toBe(0)

    const enabled = buildPublicationWorkbenchPreview({
      isPreviewEnabled: true,
      hasPublicationSources: true,
      buildTable: () => {
        tableBuildCount += 1
        return table
      },
      buildHtml: () => {
        htmlBuildCount += 1
        return '<table />'
      },
    })

    expect(enabled.previewHtml).toBe('<table />')
    expect(tableBuildCount).toBe(1)
    expect(htmlBuildCount).toBe(1)
  })

  it('handles template save, duplicate, rename, default cleanup, and status text', () => {
    const harness = createActionHarness({
      config: { ...defaultCustomPublicationConfig(), title: '表 2：机制检验' },
    })

    harness.actions().saveTemplate()
    expect(harness.templates).toHaveLength(1)
    expect(harness.templates[0]).toMatchObject({ id: 'id-1', name: '表 2：机制检验' })

    harness.actions().setDefaultTemplate('id-1')
    expect(harness.defaultTemplateId).toBe('id-1')
    expect(
      getPublicationTemplateStatus({
        matchedTemplate: harness.templates[0],
        isDefaultTableMode: false,
        defaultTemplateId: harness.defaultTemplateId,
      }),
    ).toBe('当前使用模板：表 2：机制检验')

    harness.actions().duplicateTemplate('id-1')
    expect(harness.templates[0]).toMatchObject({ id: 'id-2', name: '表 2：机制检验（副本）' })

    harness.actions().renameTemplate('id-2', '表 2：稳健性')
    expect(harness.templates[0]?.name).toBe('表 2：稳健性')

    harness.actions().deleteTemplate('id-1')
    expect(harness.defaultTemplateId).toBe('')
    expect(resolveCleanDefaultTemplateId('missing', harness.templates)).toBe('')
  })

  it('routes source, variable, and statistic actions through custom publication helpers', () => {
    const harness = createActionHarness({
      config: {
        ...defaultCustomPublicationConfig(),
        mode: 'custom',
        selectedSourceIds: ['current', 'snapshot:one'],
        variableOrder: ['x', 'z', '_cons'],
        statisticOrder: ['controls', 'n', 'adj-r2'],
      },
    })

    harness.actions().toggleSource('snapshot:one')
    expect(harness.config.selectedSourceIds).toEqual(['current'])

    harness.actions().toggleVariable('z')
    expect(harness.config.hiddenVariableIds).toEqual(['z'])

    harness.actions().moveVariable('_cons', 'up')
    expect(harness.config.variableOrder).toEqual(['x', '_cons', 'z'])

    harness.actions().updateVariableLabel('x', '核心解释变量')
    expect(harness.config.variableLabels.x).toBe('核心解释变量')

    harness.actions().setAllVariables(false)
    expect(harness.config.hiddenVariableIds).toEqual(['x', 'z', '_cons'])

    harness.actions().toggleStatistic('adj-r2')
    expect(harness.config.disabledStatisticIds).toEqual(['adj-r2'])

    harness.actions().moveStatistic('adj-r2', 'up')
    expect(harness.config.statisticOrder).toEqual(['controls', 'adj-r2', 'n'])

    harness.actions().updateStatisticLabel('n', 'Observations')
    expect(harness.config.statisticLabels.n).toBe('Observations')

    harness.actions().setAllStatistics(false)
    expect(harness.config.disabledStatisticIds).toEqual(['controls', 'n', 'adj-r2'])
  })

  it('clears dragging state after a drop reorder', () => {
    const harness = createActionHarness({
      config: {
        ...defaultCustomPublicationConfig(),
        mode: 'custom',
        selectedSourceIds: ['current', 'snapshot:one'],
        columnOrder: ['current', 'snapshot:one'],
      },
    })

    harness.actions().setDraggingItem({ kind: 'column', id: 'snapshot:one' })
    expect(harness.draggingItem).toEqual({ kind: 'column', id: 'snapshot:one' })

    harness.actions().dropItem('column', 'current')
    expect(harness.config.columnOrder).toEqual(['snapshot:one', 'current'])
    expect(harness.draggingItem).toBeNull()
  })
})
