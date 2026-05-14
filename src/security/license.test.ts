import { describe, expect, it } from 'vitest'
import {
  canExportLicensedReports,
  canRunLicensedModels,
  developmentLicenseState,
  getLicenseStatusLabel,
  licenseAllowsModelId,
  licenseAllowsModelPack,
  type LicenseState,
} from './license'

const unlicensedState: LicenseState = {
  status: 'unlicensed',
  plan: null,
  enabledModelPacks: [],
  features: [],
  message: 'not activated',
  isUsable: false,
}

describe('license capabilities', () => {
  it('opens all capabilities in development fallback mode', () => {
    expect(canRunLicensedModels(developmentLicenseState)).toBe(true)
    expect(canExportLicensedReports(developmentLicenseState)).toBe(true)
    expect(licenseAllowsModelPack(developmentLicenseState, 'core')).toBe(true)
    expect(licenseAllowsModelPack(developmentLicenseState, 'advanced')).toBe(true)
    expect(licenseAllowsModelPack(developmentLicenseState, 'experimental')).toBe(true)
  })

  it('keeps unlicensed users out of paid actions while leaving core model browsing available', () => {
    expect(canRunLicensedModels(unlicensedState)).toBe(false)
    expect(canExportLicensedReports(unlicensedState)).toBe(false)
    expect(licenseAllowsModelPack(unlicensedState, 'core')).toBe(true)
    expect(licenseAllowsModelPack(unlicensedState, 'advanced')).toBe(false)
    expect(licenseAllowsModelPack(unlicensedState, 'experimental')).toBe(false)
  })

  it('uses stable Chinese labels for visible license states', () => {
    expect(getLicenseStatusLabel('active')).toBe('已激活')
    expect(getLicenseStatusLabel('trial')).toBe('试用中')
    expect(getLicenseStatusLabel('offline-expired')).toBe('需联网验证')
  })

  it('allows optional single-model restrictions inside an active license', () => {
    const license: LicenseState = {
      status: 'active',
      plan: 'professional',
      enabledModelPacks: ['core', 'advanced'],
      enabledModelIds: ['linear-regression'],
      features: ['run-models', 'report-export'],
      message: 'active',
      isUsable: true,
    }

    expect(licenseAllowsModelId(license, 'linear-regression')).toBe(true)
    expect(licenseAllowsModelId(license, 'ordinary-regression')).toBe(false)
  })
})
