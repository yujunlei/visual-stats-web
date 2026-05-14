import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

type LicenseCertificate = {
  licenseId: string
  productId: string
  plan: 'basic' | 'professional'
  enabledModelPacks: string[]
  enabledModelIds?: string[]
  features: string[]
  machineHash: string
  issuedAt: string
  expiresAt: string
  offlineGraceUntil: string
  signature: string
}

type ElectronLicenseExports = {
  productId: string
  signCertificatePayload(payload: Omit<LicenseCertificate, 'signature'>, privateKeyPem: string): string
  validateCertificate(
    certificate: LicenseCertificate,
    options: { now: Date; machineHash: string; publicKeyPem: string },
  ): { status: string; isUsable: boolean; enabledModelPacks: string[]; enabledModelIds?: string[]; features: string[]; message: string }
}

const requireFromTest = createRequire(import.meta.url)
const electronLicense = requireFromTest('../electron/license.cjs') as ElectronLicenseExports

function createSignedCertificate(overrides: Partial<Omit<LicenseCertificate, 'signature'>> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const payload = {
    licenseId: 'lic_test',
    productId: electronLicense.productId,
    plan: 'professional' as const,
    enabledModelPacks: ['core', 'advanced', 'experimental'],
    features: ['run-models', 'report-export'],
    machineHash: 'machine-a',
    issuedAt: '2026-05-01T00:00:00.000Z',
    expiresAt: '2027-05-01T00:00:00.000Z',
    offlineGraceUntil: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
  return {
    publicKeyPem,
    certificate: {
      ...payload,
      signature: electronLicense.signCertificatePayload(payload, privateKeyPem),
    },
  }
}

describe('Electron license certificate validation', () => {
  it('accepts a signed certificate for the current machine', () => {
    const { certificate, publicKeyPem } = createSignedCertificate({ enabledModelIds: ['linear-regression'] })
    const status = electronLicense.validateCertificate(certificate, {
      now: new Date('2026-05-15T00:00:00.000Z'),
      machineHash: 'machine-a',
      publicKeyPem,
    })

    expect(status.status).toBe('active')
    expect(status.isUsable).toBe(true)
    expect(status.enabledModelPacks).toEqual(['core', 'advanced', 'experimental'])
    expect(status.enabledModelIds).toEqual(['linear-regression'])
    expect(status.features).toEqual(expect.arrayContaining(['run-models', 'report-export', 'model-pack:advanced']))
  })

  it('rejects tampered certificates', () => {
    const { certificate, publicKeyPem } = createSignedCertificate()
    const status = electronLicense.validateCertificate(
      { ...certificate, plan: 'basic', enabledModelPacks: ['core'] },
      {
        now: new Date('2026-05-15T00:00:00.000Z'),
        machineHash: 'machine-a',
        publicKeyPem,
      },
    )

    expect(status.status).toBe('invalid')
    expect(status.isUsable).toBe(false)
  })

  it('rejects machine mismatch and expired licenses', () => {
    const { certificate, publicKeyPem } = createSignedCertificate()
    expect(
      electronLicense.validateCertificate(certificate, {
        now: new Date('2026-05-15T00:00:00.000Z'),
        machineHash: 'machine-b',
        publicKeyPem,
      }).status,
    ).toBe('invalid')

    expect(
      electronLicense.validateCertificate(certificate, {
        now: new Date('2027-05-02T00:00:00.000Z'),
        machineHash: 'machine-a',
        publicKeyPem,
      }).status,
    ).toBe('expired')
  })
})
