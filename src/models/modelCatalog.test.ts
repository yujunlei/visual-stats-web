import { describe, expect, it } from 'vitest'
import { allModelPlugins, getModelCatalogEntry, getModelPlugin, modelCatalog, modelPlugins, modelTaskGroupOrder } from './registry'

describe('model catalog registry', () => {
  it('keeps plugin ids unique and fully described by catalog metadata', () => {
    const pluginIds = allModelPlugins.map((plugin) => plugin.id)
    expect(new Set(pluginIds).size).toBe(pluginIds.length)

    pluginIds.forEach((id) => {
      const entry = getModelCatalogEntry(id)
      expect(entry, id).toBeDefined()
      expect(entry?.packId, id).toMatch(/^(core|advanced|experimental)$/)
      expect(entry?.modelVersion, id).toMatch(/^\d+\.\d+\.\d+$/)
      expect(entry?.useCase.trim(), id).not.toBe('')
      expect(entry?.accuracyNotes.trim(), id).not.toBe('')
      expect(modelTaskGroupOrder, id).toContain(entry?.taskGroup)
    })

    modelCatalog.forEach((entry) => {
      expect(() => getModelPlugin(entry.id)).not.toThrow()
    })
  })

  it('shows stable, preview, and experimental packs by default with explicit maturity metadata', () => {
    const visibleIds = new Set(modelPlugins.map((plugin) => plugin.id))
    const xtregEntry = getModelCatalogEntry('xtreg-fixed-effects')
    const reghdfeEntry = getModelCatalogEntry('reghdfe-regression')

    expect(visibleIds).toContain('linear-regression')
    expect(visibleIds).toContain('xtreg-fixed-effects')
    expect(visibleIds).toContain('spatial-sar')
    expect(visibleIds).toContain('threshold-regression')
    expect(visibleIds).toContain('moderated-mediation')
    expect(xtregEntry?.maturityLevel).toBe('stable')
    expect(xtregEntry?.modelVersion).toBe('1.0.0')
    expect(reghdfeEntry?.maturityLevel).toBe('stable')
    expect(reghdfeEntry?.modelVersion).toBe('1.0.0')

    modelCatalog
      .filter((entry) => entry.maturityLevel === 'experimental')
      .forEach((entry) => {
        expect(entry.enabledByDefault, entry.id).toBe(true)
        expect(visibleIds.has(entry.id), entry.id).toBe(true)
      })
  })
})
