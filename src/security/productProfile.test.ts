import { describe, expect, it } from 'vitest'
import {
  defaultPackagingProfile,
  normalizePackagingProfile,
  parsePackagingProfileJson,
  resolvePackagedModelIds,
  type PackagingProfile,
} from './productProfile'

describe('product profile', () => {
  it('normalizes invalid product profiles back to safe defaults', () => {
    const profile = normalizePackagingProfile({
      productName: '  Visual Stats Pro  ',
      appId: '',
      version: 123,
      licenseServerUrl: '  https://license.example.com  ',
      enabledModelPacks: ['core', 'unknown', 'core'],
      enabledModelIds: [' linear-regression ', '', 42],
      disabledModelIds: [' ordinary-regression ', null],
      targetPlatform: 'win',
    })

    expect(profile.productName).toBe('Visual Stats Pro')
    expect(profile.appId).toBe(defaultPackagingProfile.appId)
    expect(profile.licenseServerUrl).toBe('https://license.example.com')
    expect(profile.enabledModelPacks).toEqual(['core'])
    expect(profile.enabledModelIds).toEqual(['linear-regression'])
    expect(profile.disabledModelIds).toEqual(['ordinary-regression'])
  })

  it('parses embedded JSON defensively', () => {
    expect(parsePackagingProfileJson('{bad json')).toEqual(defaultPackagingProfile)
    expect(parsePackagingProfileJson(JSON.stringify({ enabledModelPacks: ['advanced'] })).enabledModelPacks).toEqual(['advanced'])
  })

  it('resolves model ids from package packs plus single-model overrides', () => {
    const profile: Pick<PackagingProfile, 'enabledModelPacks' | 'enabledModelIds' | 'disabledModelIds'> = {
      enabledModelPacks: ['core'],
      enabledModelIds: ['spatial-sar'],
      disabledModelIds: ['linear-regression'],
    }
    const ids = resolvePackagedModelIds(profile, [
      { id: 'linear-regression', packId: 'core' },
      { id: 'ordinary-regression', packId: 'core' },
      { id: 'reghdfe-regression', packId: 'advanced' },
      { id: 'spatial-sar', packId: 'experimental' },
    ])

    expect(ids).toEqual(['ordinary-regression', 'spatial-sar'])
  })
})
