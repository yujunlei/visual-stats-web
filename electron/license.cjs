const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const productId = 'visual-stats-lab'
const defaultTrialDays = 14
const clockSkewMs = 5 * 60 * 1000
const defaultLicenseServerUrl = process.env.VISUAL_STATS_LICENSE_SERVER_URL || 'https://license.visualstatslab.com'

const defaultLicensePublicKeyPem = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoPACm+9Y8bbrcsnOzRVr
Xb8gVHbJ9QPWWBHQJLQ86C5FzwZ7Bz3equrPMCBjcIlJC/mL6oD4q85C7p83Y9X4
sUz2MekxYOdKtTT90TI4C4Q5J67gDwvYBOnw+mL9Npx1hb9t7JdagkWyuxI4HCcp
A06DJQM4cKaIa0InacOttPBPHTYLc88E+3SxmRr/xjdb33rB0dZUerb1OBUs9ePv
8E/Q4iegFM03skc/FEct1uHkEinWeqkMtABL3m4Yb3HkGm3pG+U5+PT3C6N6lri6
/pOthUlgjaOPmW7m7O/5D3x4cP5J+OYjFffsnR2VDmQodrXe6/MEiKVU82RkP6UM
fQIDAQAB
-----END PUBLIC KEY-----`

function readProductProfile() {
  const candidates = [
    path.join(__dirname, '../build/product-profile.json'),
    path.join(process.resourcesPath || '', 'build/product-profile.json'),
  ]
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return JSON.parse(fs.readFileSync(candidate, 'utf8'))
      }
    } catch {
      // Invalid product profile should not block startup; fall back to defaults.
    }
  }
  return {}
}

const productProfile = readProductProfile()
const licensePublicKeyPem = process.env.VISUAL_STATS_LICENSE_PUBLIC_KEY_PEM || productProfile.publicKeyPem || defaultLicensePublicKeyPem
const licenseServerUrl = process.env.VISUAL_STATS_LICENSE_SERVER_URL || productProfile.licenseServerUrl || defaultLicenseServerUrl

const planPacks = {
  trial: ['core', 'advanced', 'experimental'],
  basic: ['core'],
  professional: ['core', 'advanced', 'experimental'],
  enterprise: ['core', 'advanced', 'experimental'],
}

const packFeatures = {
  core: 'model-pack:core',
  advanced: 'model-pack:advanced',
  experimental: 'model-pack:experimental',
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function createMachineHash(dependencies = {}) {
  const platform = dependencies.platform || process.platform
  const arch = dependencies.arch || process.arch
  const hostname = dependencies.hostname || os.hostname()
  const username = dependencies.username || (() => {
    try {
      return os.userInfo().username
    } catch {
      return 'unknown'
    }
  })()

  return hashValue([platform, arch, hostname, username].join('|'))
}

function getCertificatePayload(certificate) {
  const { signature, ...payload } = certificate || {}
  return payload
}

function signCertificatePayload(payload, privateKeyPem) {
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(stableStringify(payload))
  signer.end()
  return signer.sign(privateKeyPem, 'base64')
}

function verifyCertificateSignature(certificate, publicKeyPem = licensePublicKeyPem) {
  if (!certificate || typeof certificate.signature !== 'string') return false
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(stableStringify(getCertificatePayload(certificate)))
  verifier.end()
  return verifier.verify(publicKeyPem, certificate.signature, 'base64')
}

function normalizeModelPacks(plan, enabledModelPacks) {
  const requested = Array.isArray(enabledModelPacks) && enabledModelPacks.length > 0 ? enabledModelPacks : planPacks[plan] || ['core']
  return Array.from(new Set(requested.filter((pack) => ['core', 'advanced', 'experimental'].includes(pack))))
}

function buildFeatures(modelPacks, extraFeatures = []) {
  return Array.from(new Set(['run-models', 'report-export', ...modelPacks.map((pack) => packFeatures[pack]).filter(Boolean), ...extraFeatures]))
}

function createState(overrides) {
  const base = {
    status: 'unlicensed',
    plan: null,
    enabledModelPacks: [],
    features: [],
    message: '请输入授权密钥激活 Visual Stats Lab。',
    serverUrl: licenseServerUrl,
    isUsable: false,
  }
  return { ...base, ...overrides }
}

function validateCertificate(certificate, options = {}) {
  const now = options.now || new Date()
  const machineHash = options.machineHash || createMachineHash()
  const publicKeyPem = options.publicKeyPem || licensePublicKeyPem

  if (!certificate) return createState({})
  if (!verifyCertificateSignature(certificate, publicKeyPem)) {
    return createState({ status: 'invalid', message: '授权证书签名无效，请重新联网激活。' })
  }
  if (certificate.productId !== productId) {
    return createState({ status: 'invalid', message: '授权证书不属于当前产品。' })
  }
  if (certificate.machineHash && certificate.machineHash !== machineHash) {
    return createState({ status: 'invalid', message: '授权证书与当前设备不匹配。' })
  }

  const expiresAt = new Date(certificate.expiresAt)
  const offlineGraceUntil = new Date(certificate.offlineGraceUntil || certificate.expiresAt)
  const modelPacks = normalizeModelPacks(certificate.plan, certificate.enabledModelPacks)
  const stateBase = {
    status: 'active',
    plan: certificate.plan,
    licenseId: certificate.licenseId,
    productId: certificate.productId,
    machineHash,
    issuedAt: certificate.issuedAt,
    expiresAt: certificate.expiresAt,
    offlineGraceUntil: certificate.offlineGraceUntil,
    enabledModelPacks: modelPacks,
    enabledModelIds: Array.isArray(certificate.enabledModelIds) ? certificate.enabledModelIds.filter((id) => typeof id === 'string') : undefined,
    features: buildFeatures(modelPacks, certificate.features),
    serverUrl: licenseServerUrl,
    lastCheckedAt: now.toISOString(),
    isUsable: true,
  }

  if (Number.isNaN(expiresAt.getTime()) || now.getTime() > expiresAt.getTime()) {
    return createState({ ...stateBase, status: 'expired', isUsable: false, message: '授权已过期，请续费或重新激活。' })
  }

  if (!Number.isNaN(offlineGraceUntil.getTime()) && now.getTime() > offlineGraceUntil.getTime()) {
    return createState({ ...stateBase, status: 'offline-expired', isUsable: false, message: '离线宽限期已结束，请联网刷新授权。' })
  }

  return createState({ ...stateBase, message: '授权有效。' })
}

function getLicenseStoragePath(app) {
  return path.join(app.getPath('userData'), 'license', 'license-cache.json')
}

function readStoredLicense(app, safeStorage) {
  const storagePath = getLicenseStoragePath(app)
  if (!fs.existsSync(storagePath)) return {}

  try {
    const envelope = JSON.parse(fs.readFileSync(storagePath, 'utf8'))
    if (envelope.protected && envelope.payload && safeStorage?.isEncryptionAvailable?.()) {
      return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.payload, 'base64')))
    }
    return envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {}
  } catch {
    return { corrupt: true }
  }
}

function writeStoredLicense(app, safeStorage, data) {
  const storagePath = getLicenseStoragePath(app)
  fs.mkdirSync(path.dirname(storagePath), { recursive: true })
  if (safeStorage?.isEncryptionAvailable?.()) {
    fs.writeFileSync(
      storagePath,
      JSON.stringify({
        storageVersion: 1,
        protected: true,
        payload: safeStorage.encryptString(JSON.stringify(data)).toString('base64'),
      }, null, 2),
    )
    return
  }
  fs.writeFileSync(storagePath, JSON.stringify({ storageVersion: 1, protected: false, payload: data }, null, 2))
}

function clearStoredLicense(app) {
  try {
    fs.rmSync(getLicenseStoragePath(app), { force: true })
  } catch {
    // Best-effort cleanup only.
  }
}

function getNowWithClockCheck(stored) {
  const now = new Date()
  if (stored.lastServerTime) {
    const lastServerTime = new Date(stored.lastServerTime)
    if (!Number.isNaN(lastServerTime.getTime()) && now.getTime() + clockSkewMs < lastServerTime.getTime()) {
      return { now, clockInvalid: true }
    }
  }
  return { now, clockInvalid: false }
}

function trialState(stored, machineHash, now) {
  const trial = stored.trial
  if (!trial) return null
  if (trial.machineHash !== machineHash) {
    return createState({ status: 'invalid', message: '试用记录与当前设备不匹配。' })
  }
  if (now.getTime() > new Date(trial.expiresAt).getTime()) {
    return createState({
      status: 'expired',
      plan: 'trial',
      machineHash,
      issuedAt: trial.startedAt,
      expiresAt: trial.expiresAt,
      offlineGraceUntil: trial.expiresAt,
      message: '试用期已结束，请输入授权密钥激活。',
      isUsable: false,
    })
  }
  const modelPacks = normalizeModelPacks('trial')
  return createState({
    status: 'trial',
    plan: 'trial',
    machineHash,
    issuedAt: trial.startedAt,
    expiresAt: trial.expiresAt,
    offlineGraceUntil: trial.expiresAt,
    enabledModelPacks: modelPacks,
    features: buildFeatures(modelPacks),
    message: '试用授权有效。',
    lastCheckedAt: now.toISOString(),
    isUsable: true,
  })
}

function getStoredLicenseStatus(app, safeStorage, dependencies = {}) {
  const stored = readStoredLicense(app, safeStorage)
  const machineHash = dependencies.machineHash || createMachineHash(dependencies)
  const { now, clockInvalid } = getNowWithClockCheck(stored)
  if (clockInvalid) {
    return createState({ status: 'invalid', machineHash, message: '检测到系统时间早于最近授权校验时间，请校正时间后重试。' })
  }
  if (stored.corrupt) {
    return createState({ status: 'invalid', machineHash, message: '本地授权缓存损坏，请重新激活。' })
  }
  if (stored.certificate) {
    return validateCertificate(stored.certificate, { now, machineHash })
  }
  return trialState(stored, machineHash, now) || createState({ machineHash })
}

async function postLicenseRequest(endpoint, payload, dependencies = {}) {
  const fetchImpl = dependencies.fetch || global.fetch
  if (!fetchImpl) throw new Error('当前运行环境不支持联网授权请求。')
  const serverUrl = dependencies.serverUrl || licenseServerUrl
  const response = await fetchImpl(`${serverUrl.replace(/\/$/, '')}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error || `授权服务器返回 ${response.status}`)
  }
  return body
}

async function activateLicense(app, safeStorage, licenseKey, dependencies = {}) {
  const machineHash = dependencies.machineHash || createMachineHash(dependencies)
  const now = new Date()
  try {
    const body = await postLicenseRequest('/activate', {
      licenseKey,
      productId,
      machineHash,
      appVersion: app.getVersion(),
    }, dependencies)
    const status = validateCertificate(body.certificate, { now, machineHash })
    if (!status.isUsable) {
      return { ok: false, status, error: status.message }
    }
    writeStoredLicense(app, safeStorage, {
      certificate: body.certificate,
      lastServerTime: body.serverTime || now.toISOString(),
    })
    return { ok: true, status: getStoredLicenseStatus(app, safeStorage, { machineHash }) }
  } catch (error) {
    const status = createState({
      status: 'error',
      machineHash,
      message: error instanceof Error ? error.message : '激活失败。',
      isUsable: false,
    })
    return { ok: false, status, error: status.message }
  }
}

async function refreshLicense(app, safeStorage, dependencies = {}) {
  const stored = readStoredLicense(app, safeStorage)
  const machineHash = dependencies.machineHash || createMachineHash(dependencies)
  if (!stored.certificate) {
    const status = getStoredLicenseStatus(app, safeStorage, { machineHash })
    return { ok: false, status, error: '当前没有可刷新的授权证书。' }
  }

  try {
    const body = await postLicenseRequest('/refresh', {
      licenseId: stored.certificate.licenseId,
      productId,
      machineHash,
    }, dependencies)
    const nextCertificate = body.certificate || stored.certificate
    const status = validateCertificate(nextCertificate, { now: new Date(), machineHash })
    if (!status.isUsable) return { ok: false, status, error: status.message }
    writeStoredLicense(app, safeStorage, {
      ...stored,
      certificate: nextCertificate,
      lastServerTime: body.serverTime || new Date().toISOString(),
    })
    return { ok: true, status: getStoredLicenseStatus(app, safeStorage, { machineHash }) }
  } catch (error) {
    const status = getStoredLicenseStatus(app, safeStorage, { machineHash })
    return { ok: false, status, error: error instanceof Error ? error.message : '刷新授权失败。' }
  }
}

function startTrial(app, safeStorage, dependencies = {}) {
  const stored = readStoredLicense(app, safeStorage)
  const machineHash = dependencies.machineHash || createMachineHash(dependencies)
  if (stored.trial) {
    const status = getStoredLicenseStatus(app, safeStorage, { machineHash })
    return { ok: status.status === 'trial', status, error: status.status === 'trial' ? undefined : '当前设备已经使用过试用期。' }
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + defaultTrialDays * 24 * 60 * 60 * 1000)
  writeStoredLicense(app, safeStorage, {
    ...stored,
    trial: {
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      machineHash,
    },
    lastServerTime: stored.lastServerTime || now.toISOString(),
  })
  return { ok: true, status: getStoredLicenseStatus(app, safeStorage, { machineHash }) }
}

async function deactivateLicense(app, safeStorage, dependencies = {}) {
  const stored = readStoredLicense(app, safeStorage)
  const machineHash = dependencies.machineHash || createMachineHash(dependencies)
  if (stored.certificate) {
    await postLicenseRequest('/deactivate', {
      licenseId: stored.certificate.licenseId,
      productId,
      machineHash,
    }, dependencies).catch(() => null)
  }
  if (stored.trial) {
    writeStoredLicense(app, safeStorage, {
      trial: stored.trial,
      lastServerTime: stored.lastServerTime || new Date().toISOString(),
    })
    return { ok: true, status: getStoredLicenseStatus(app, safeStorage, { machineHash }) }
  }
  clearStoredLicense(app)
  return { ok: true, status: getStoredLicenseStatus(app, safeStorage, { machineHash }) }
}

function registerLicenseIpcHandlers(electron, dependencies = {}) {
  const { app, ipcMain, safeStorage } = electron
  const storageSafeStorage = dependencies.safeStorage || safeStorage
  ipcMain.handle('license:get-status', () => getStoredLicenseStatus(app, storageSafeStorage))
  ipcMain.handle('license:activate', (_event, licenseKey) => activateLicense(app, storageSafeStorage, String(licenseKey || '').trim()))
  ipcMain.handle('license:refresh', () => refreshLicense(app, storageSafeStorage))
  ipcMain.handle('license:start-trial', () => startTrial(app, storageSafeStorage))
  ipcMain.handle('license:deactivate', () => deactivateLicense(app, storageSafeStorage))
}

module.exports = {
  productId,
  licensePublicKeyPem,
  readProductProfile,
  stableStringify,
  createMachineHash,
  signCertificatePayload,
  verifyCertificateSignature,
  validateCertificate,
  getStoredLicenseStatus,
  activateLicense,
  refreshLicense,
  startTrial,
  deactivateLicense,
  registerLicenseIpcHandlers,
}
