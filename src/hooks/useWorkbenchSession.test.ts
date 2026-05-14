import { describe, expect, it } from 'vitest'
import type { ModelConfig, ModelPlugin } from '../models/types'
import {
  applyFieldRole,
  buildValidationIssues,
  createImportPlan,
  createModelSwitchReset,
  defaultInferenceConfig,
  importLimits,
  noModelPlugin,
  resolveEffectiveWorkflowStep,
  setRoleTimeField,
  toggleRoleField,
  validateImportFile,
} from './useWorkbenchSession'

const createPlugin = (patch: Partial<ModelPlugin> = {}): ModelPlugin => ({
  id: 'test-model',
  name: '测试模型',
  nodeLabel: '测试模型',
  panelLabel: 'Test model',
  resultLabel: '结果',
  description: 'Test plugin',
  methodLabel: 'OLS',
  shortName: 'TEST',
  fullName: 'Test Model',
  category: '回归建模',
  keywords: [],
  requiresTarget: true,
  targetLabel: '因变量 Y',
  featuresLabel: '自变量 X',
  downloadName: 'test.csv',
  supportsCategoricalFeatures: false,
  supportsInference: false,
  getDefaultConfig: () => ({ target: '', features: [], params: {} }),
  sanitizeConfig: (config) => config,
  getFormula: (config) => `${config.target || 'y'} ~ ${config.features.join(' + ') || 'x'}`,
  getSettings: () => [],
  fit: () => ({
    id: 'test-result',
    summary: [],
    tables: [],
    diagnostics: [],
    message: 'done',
  }),
  exportCsv: () => '',
  ...patch,
})

describe('useWorkbenchSession helpers', () => {
  it('cleans empty import rows before building missing value alerts', () => {
    const plan = createImportPlan(
      [
        { firm: '', year: '', y: '' },
        { firm: 'A', year: 2020, y: 1 },
        { firm: 'B', year: 2021, y: null },
      ],
      'panel.csv',
    )

    expect(plan.kind).toBe('missing-values')
    if (plan.kind !== 'missing-values') return
    expect(plan.alert.rows).toEqual([
      { firm: 'A', year: 2020, y: 1 },
      { firm: 'B', year: 2021, y: null },
    ])
    expect(plan.alert.missingCells).toBe(1)
    expect(plan.alert.affectedRows).toBe(1)
    expect(plan.alert.fields).toEqual([{ name: 'y', missing: 1 }])
  })

  it('returns an empty import error when all rows are blank', () => {
    const plan = createImportPlan([{ a: '', b: null }], 'empty.csv')

    expect(plan).toEqual({ kind: 'empty', error: '文件没有可读取的数据。' })
  })

  it('rejects oversized import files and oversized parsed tables before opening the wizard', () => {
    expect(validateImportFile({ size: importLimits.maxFileSizeBytes + 1 })).toContain('文件过大')

    const tooWide = [Object.fromEntries(Array.from({ length: importLimits.maxColumns + 1 }, (_, index) => [`c${index}`, index]))]
    expect(createImportPlan(tooWide, 'wide.csv')).toEqual({ kind: 'empty', error: `字段数过多：当前限制为 ${importLimits.maxColumns.toLocaleString('zh-CN')} 个字段。` })
  })

  it('keeps id, time, and group roles mutually exclusive', () => {
    const roles = { idFields: ['firm'], timeField: 'year', groupFields: ['region'] }

    expect(applyFieldRole(roles, 'firm', 'group')).toEqual({
      idFields: [],
      timeField: 'year',
      groupFields: ['region', 'firm'],
    })
    expect(applyFieldRole(roles, 'region', 'time')).toEqual({
      idFields: ['firm'],
      timeField: 'region',
      groupFields: [],
    })
    expect(applyFieldRole(roles, 'year', 'model')).toEqual({
      idFields: ['firm'],
      timeField: '',
      groupFields: ['region'],
    })
  })

  it('keeps pending role toggles mutually exclusive', () => {
    const roles = { idFields: ['firm'], timeField: 'year', groupFields: [] }

    expect(toggleRoleField(roles, 'group', 'year')).toEqual({
      idFields: ['firm'],
      timeField: '',
      groupFields: ['year'],
    })
    expect(toggleRoleField(roles, 'id', 'firm')).toEqual({
      idFields: [],
      timeField: 'year',
      groupFields: [],
    })
    expect(setRoleTimeField({ idFields: ['firm'], timeField: '', groupFields: ['year'] }, 'year')).toEqual({
      idFields: ['firm'],
      timeField: 'year',
      groupFields: [],
    })
  })

  it('describes the state reset needed when switching models', () => {
    const reset = createModelSwitchReset(createPlugin({ id: 'ols', name: '线性回归' }), true)

    expect(reset.activeModelId).toBe('ols')
    expect(reset.draftModelId).toBe('ols')
    expect(reset.modelConfig).toEqual({ target: '', features: [], params: {} })
    expect(reset.workflowStep).toBe('variables')
    expect(reset.isVariableSetupOpen).toBe(false)
    expect(reset.runState).toMatchObject({
      result: null,
      error: '',
      signature: '',
    })
    expect(reset.runState.logs[0]?.message).toContain('已切换到线性回归')
  })

  it('validates regular target and feature requirements', () => {
    const plugin = createPlugin()
    const config: ModelConfig = { target: '', features: [], params: {} }

    expect(
      buildValidationIssues({
        rows: [{ y: 1, x: 2 }],
        hasDataset: true,
        hasActiveModel: true,
        activeModel: plugin,
        sanitizedConfig: config,
        inferenceConfig: defaultInferenceConfig,
        effectiveInference: defaultInferenceConfig,
      }).map((issue) => issue.message),
    ).toEqual(['请设置「因变量 Y」。', '请至少选择一个「自变量 X」。'])
  })

  it('validates schema requirements, duplicate fields, and special field conflicts', () => {
    const plugin = createPlugin({
      id: 'crosstab-chi-square',
      requiresTarget: false,
      parameterSchema: [
        { id: 'rowVar', label: '行变量', kind: 'column', required: true },
        { id: 'colVar', label: '列变量', kind: 'column', required: true },
        { id: 'controls', label: '控制变量', kind: 'columns' },
      ],
    })

    const issues = buildValidationIssues({
      rows: [{ a: 'A', b: 'B' }],
      hasDataset: true,
      hasActiveModel: true,
      activeModel: plugin,
      sanitizedConfig: { target: '', features: [], params: { rowVar: 'a', colVar: 'a', controls: ['a'] } },
      inferenceConfig: defaultInferenceConfig,
      effectiveInference: defaultInferenceConfig,
    })

    expect(issues).toEqual([
      { level: 'warning', message: '字段「a」被重复选择，请确认是否符合模型设定。' },
      { level: 'error', message: '交叉/卡方的行变量和列变量不能相同。' },
    ])
  })

  it('validates cluster inference configuration', () => {
    const plugin = createPlugin({ supportsInference: true })
    const issues = buildValidationIssues({
      rows: [{ y: 1, x: 2 }],
      hasDataset: true,
      hasActiveModel: true,
      activeModel: plugin,
      sanitizedConfig: { target: 'y', features: ['x'], params: {} },
      inferenceConfig: { standardError: 'cluster', clusterField: '' },
      effectiveInference: { standardError: 'cluster', clusterField: '' },
    })

    expect(issues).toEqual([{ level: 'error', message: 'Cluster 标准误需要选择聚类字段。' }])
  })

  it('resolves effective workflow state from run, result, stale, and missing dataset states', () => {
    expect(
      resolveEffectiveWorkflowStep({
        isModelRunning: true,
        hasActiveModel: true,
        modelError: '',
        result: null,
        hasStaleResult: false,
        hasDataset: true,
        workflowStep: 'variables',
      }),
    ).toBe('run')

    expect(
      resolveEffectiveWorkflowStep({
        isModelRunning: false,
        hasActiveModel: true,
        modelError: '',
        result: { id: 'result' },
        hasStaleResult: false,
        hasDataset: true,
        workflowStep: 'variables',
      }),
    ).toBe('results')

    expect(
      resolveEffectiveWorkflowStep({
        isModelRunning: false,
        hasActiveModel: true,
        modelError: '',
        result: { id: 'result' },
        hasStaleResult: true,
        hasDataset: true,
        workflowStep: 'results',
      }),
    ).toBe('variables')

    expect(
      resolveEffectiveWorkflowStep({
        isModelRunning: false,
        hasActiveModel: true,
        modelError: '',
        result: null,
        hasStaleResult: false,
        hasDataset: false,
        workflowStep: 'roles',
      }),
    ).toBe('upload')

    expect(
      resolveEffectiveWorkflowStep({
        isModelRunning: false,
        hasActiveModel: false,
        modelError: '',
        result: null,
        hasStaleResult: false,
        hasDataset: false,
        workflowStep: 'upload',
      }),
    ).toBe('model')
  })

  it('uses the no-model plugin as a safe placeholder', () => {
    expect(noModelPlugin.id).toBe('')
    expect(noModelPlugin.getFormula({ target: '', features: [], params: {} })).toBe('尚未完成变量设定')
  })
})
