import { describe, expect, it } from 'vitest'
import { buildCustomPublicationNote, defaultCustomPublicationConfig, normalizeCustomPublicationConfig } from './customPublicationConfig'

describe('custom publication config', () => {
  it('defaults to current three-line mode', () => {
    const config = defaultCustomPublicationConfig()

    expect(config.mode).toBe('current-three-line')
    expect(config.selectedSourceIds).toEqual([])
    expect(config.formatRules.parenthesisMode).toBe('t')
    expect(config.note).toContain('括号内为 t 值')
  })

  it('migrates legacy drafts without an explicit mode to current three-line mode', () => {
    const config = normalizeCustomPublicationConfig({
      title: 'Legacy draft',
      selectedSourceIds: ['current', 'snapshot-1'],
    })

    expect(config.mode).toBe('current-three-line')
    expect(config.title).toBe('Legacy draft')
    expect(config.selectedSourceIds).toEqual(['current', 'snapshot-1'])
  })

  it('deep-merges partial format rules', () => {
    const config = normalizeCustomPublicationConfig({
      mode: 'custom',
      formatRules: {
        coefficientDigits: 3,
        starLevels: { one: 0.2 },
      },
    })

    expect(config.mode).toBe('custom')
    expect(config.formatRules.coefficientDigits).toBe(3)
    expect(config.formatRules.starLevels).toEqual({ one: 0.2, two: 0.05, three: 0.01 })
  })

  it('builds the note from parenthesis and star rules', () => {
    const note = buildCustomPublicationNote({
      ...defaultCustomPublicationConfig().formatRules,
      parenthesisMode: 'stdError',
      starLevels: { one: 0.15, two: 0.05, three: 0.001 },
    })

    expect(note).toBe('注：稳健标准误；括号内为 标准误；* p<0.15，** p<0.05，*** p<0.001。')
  })
})
