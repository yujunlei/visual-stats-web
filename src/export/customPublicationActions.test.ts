import { describe, expect, it } from 'vitest'
import {
  applyCustomPublicationTemplateConfig,
  createCustomPublicationTemplate,
  customPublicationAsCustom,
  moveCustomPublicationColumn,
  moveOrderedItem,
  reorderCustomPublicationByDrop,
  setAllCustomPublicationStatistics,
  setAllCustomPublicationVariables,
  toggleCustomPublicationSource,
  toggleCustomPublicationStatistic,
  toggleCustomPublicationVariable,
  updateCustomPublicationColumn,
  updateCustomPublicationFormatRules,
  updateCustomPublicationText,
  updateCustomPublicationVariableLabel,
} from './customPublicationActions'
import { buildCustomPublicationNote, defaultCustomPublicationConfig } from './customPublicationConfig'

describe('customPublicationActions', () => {
  it('moves ordered items without mutating the input array', () => {
    const input = ['a', 'b', 'c']
    expect(moveOrderedItem(input, 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(input).toEqual(['a', 'b', 'c'])
    expect(moveOrderedItem(input, 'missing', 0)).toBe(input)
  })

  it('switches default table mode to custom with default sources', () => {
    const next = customPublicationAsCustom(defaultCustomPublicationConfig(), ['current'])
    expect(next.mode).toBe('custom')
    expect(next.selectedSourceIds).toEqual(['current'])
  })

  it('updates text fields in custom mode', () => {
    const next = updateCustomPublicationText(defaultCustomPublicationConfig(), ['current'], { title: '表 2' })
    expect(next.mode).toBe('custom')
    expect(next.title).toBe('表 2')
  })

  it('updates format rules and regenerates the auto note only when untouched', () => {
    const config = defaultCustomPublicationConfig()
    const next = updateCustomPublicationFormatRules(config, ['current'], { parenthesisMode: 'stdError' })
    expect(next.note).toBe(buildCustomPublicationNote(next.formatRules))

    const manualNote = { ...config, note: '手写注释' }
    const preserved = updateCustomPublicationFormatRules(manualNote, ['current'], { statisticDigits: 3 })
    expect(preserved.note).toBe('手写注释')
  })

  it('toggles sources from the effective source ids', () => {
    const config = defaultCustomPublicationConfig()
    const removed = toggleCustomPublicationSource(config, 'current', ['current'], ['current', 'snapshot:1'])
    expect(removed.selectedSourceIds).toEqual([])

    const added = toggleCustomPublicationSource(removed, 'snapshot:1', ['current'], ['snapshot:1'])
    expect(added.selectedSourceIds).toEqual(['current', 'snapshot:1'])
  })

  it('updates columns and moves them through available ids', () => {
    const withColumn = updateCustomPublicationColumn(defaultCustomPublicationConfig(), ['current'], 'current', { label: '(A)', modelLabel: 'OLS' })
    expect(withColumn.columns.current).toMatchObject({ label: '(A)', modelLabel: 'OLS' })

    const withOrder = { ...withColumn, columnOrder: ['current', 'snapshot:1'] }
    expect(moveCustomPublicationColumn(withOrder, ['current'], 'snapshot:1', 'up', ['current', 'snapshot:1']).columnOrder).toEqual(['snapshot:1', 'current'])
  })

  it('updates variable labels and visibility', () => {
    const labeled = updateCustomPublicationVariableLabel(defaultCustomPublicationConfig(), ['current'], 'x', '核心解释变量')
    expect(labeled.variableLabels.x).toBe('核心解释变量')

    const hidden = toggleCustomPublicationVariable(labeled, ['current'], 'x')
    expect(hidden.hiddenVariableIds).toEqual(['x'])
    expect(toggleCustomPublicationVariable(hidden, ['current'], 'x').hiddenVariableIds).toEqual([])
  })

  it('updates statistic visibility and bulk toggles', () => {
    const disabled = toggleCustomPublicationStatistic(defaultCustomPublicationConfig(), ['current'], 'n')
    expect(disabled.disabledStatisticIds).toEqual(['n'])

    expect(setAllCustomPublicationStatistics(disabled, ['current'], true, ['n', 'adj-r2']).disabledStatisticIds).toEqual([])
    expect(setAllCustomPublicationVariables(disabled, ['current'], false, ['x', 'z']).hiddenVariableIds).toEqual(['x', 'z'])
  })

  it('reorders by drag-and-drop for the requested item kind', () => {
    const config = {
      ...defaultCustomPublicationConfig(),
      mode: 'custom' as const,
      selectedSourceIds: ['current'],
      variableOrder: ['x', 'z', 'w'],
    }

    const next = reorderCustomPublicationByDrop(config, ['current'], { kind: 'variable', id: 'w' }, 'variable', 'x', {
      column: [],
      variable: ['x', 'z', 'w'],
      statistic: [],
    })

    expect(next.variableOrder).toEqual(['w', 'x', 'z'])
  })

  it('creates and applies templates as custom configs', () => {
    const template = createCustomPublicationTemplate(defaultCustomPublicationConfig(), ['current'], '默认模板', 'tpl-1', '2026-05-11T00:00:00.000Z')
    expect(template.config.mode).toBe('custom')
    expect(template.config.selectedSourceIds).toEqual(['current'])

    const applied = applyCustomPublicationTemplateConfig(template.config, ['fallback'])
    expect(applied.mode).toBe('custom')
    expect(applied.selectedSourceIds).toEqual(['current'])
  })
})
