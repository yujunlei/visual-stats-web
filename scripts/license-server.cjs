#!/usr/bin/env node
const http = require('node:http')
const fs = require('node:fs')
const { productId, signCertificatePayload } = require('../electron/license.cjs')

const port = Number(process.env.LICENSE_SERVER_PORT || 8787)
const privateKeyPem = process.env.LICENSE_PRIVATE_KEY_PEM

if (!privateKeyPem) {
  console.error('LICENSE_PRIVATE_KEY_PEM is required. Run `node scripts/license-keypair.cjs` to generate a development key pair.')
  process.exit(1)
}

const fallbackLicenseKeys = {
  'VSL-DEV-BASIC-2026': { plan: 'basic', days: 365, enabledModelPacks: ['core'] },
  'VSL-DEV-PRO-2026': { plan: 'professional', days: 365, enabledModelPacks: ['core', 'advanced', 'experimental'] },
}

function normalizeLicenseRecord(record) {
  const durationDays = Number(record.durationDays ?? record.days ?? 365)
  const offlineGraceDays = Number(record.offlineGraceDays ?? 30)
  return {
    ...record,
    plan: typeof record.plan === 'string' ? record.plan : 'professional',
    durationDays: Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 365,
    offlineGraceDays: Number.isFinite(offlineGraceDays) && offlineGraceDays > 0 ? offlineGraceDays : 30,
    enabledModelPacks: Array.isArray(record.enabledModelPacks) ? record.enabledModelPacks : ['core'],
    enabledModelIds: Array.isArray(record.enabledModelIds) ? record.enabledModelIds.filter((id) => typeof id === 'string') : [],
    maxActivations: Math.max(Number(record.maxActivations) || 1, 1),
  }
}

function loadLicenseKeys() {
  const storePath = process.env.LICENSE_KEY_STORE_PATH
  const allowDevFallback = process.env.ALLOW_DEV_LICENSE_KEYS === '1'
  if (!storePath) {
    if (allowDevFallback) return fallbackLicenseKeys
    console.warn('LICENSE_KEY_STORE_PATH is not set. No license keys are loaded. Set ALLOW_DEV_LICENSE_KEYS=1 only for local development.')
    return {}
  }
  try {
    const records = JSON.parse(fs.readFileSync(storePath, 'utf8'))
    if (!Array.isArray(records)) return {}
    return records.reduce((map, record) => {
      if (record && typeof record.licenseKey === 'string') {
        map[record.licenseKey] = normalizeLicenseRecord(record)
      }
      return map
    }, {})
  } catch (error) {
    console.warn(`Failed to read LICENSE_KEY_STORE_PATH=${storePath}: ${error.message}`)
    return {}
  }
}

const licenseKeys = loadLicenseKeys()

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1024 * 1024) {
        request.destroy()
        reject(new Error('request-too-large'))
      }
    })
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
  })
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function createCertificate(licenseKey, licenseRecord, body) {
  const now = new Date()
  const normalizedRecord = normalizeLicenseRecord(licenseRecord)
  const expiresAt = new Date(now.getTime() + normalizedRecord.durationDays * 24 * 60 * 60 * 1000)
  const offlineGraceUntil = new Date(now.getTime() + normalizedRecord.offlineGraceDays * 24 * 60 * 60 * 1000)
  const payload = {
    licenseId: `lic_${licenseKey.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    orderId: `dev_order_${licenseKey}`,
    productId,
    plan: normalizedRecord.plan,
    enabledModelPacks: normalizedRecord.enabledModelPacks,
    enabledModelIds: normalizedRecord.enabledModelIds,
    features: ['run-models', 'report-export'],
    machineHash: body.machineHash,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    offlineGraceUntil: offlineGraceUntil.toISOString(),
  }
  return {
    ...payload,
    signature: signCertificatePayload(payload, privateKeyPem),
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'POST') {
    sendJson(response, 404, { error: 'not-found' })
    return
  }

  try {
    const body = await readJson(request)

    if (request.url === '/activate') {
      const record = licenseKeys[String(body.licenseKey || '').trim()]
      if (!record || body.productId !== productId || !body.machineHash) {
        sendJson(response, 403, { error: '授权密钥无效或请求信息不完整。' })
        return
      }
      sendJson(response, 200, {
        certificate: createCertificate(body.licenseKey, record, body),
        serverTime: new Date().toISOString(),
      })
      return
    }

    if (request.url === '/refresh') {
      sendJson(response, 200, { serverTime: new Date().toISOString() })
      return
    }

    if (request.url === '/status') {
      const isKnown = Object.prototype.hasOwnProperty.call(licenseKeys, String(body.licenseKey || '').trim())
      sendJson(response, isKnown ? 200 : 404, {
        ok: isKnown,
        serverTime: new Date().toISOString(),
      })
      return
    }

    if (request.url === '/deactivate') {
      sendJson(response, 200, { ok: true, serverTime: new Date().toISOString() })
      return
    }

    sendJson(response, 404, { error: 'not-found' })
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'bad-request' })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Visual Stats Lab dev license server listening on http://127.0.0.1:${port}`)
  console.log(`Loaded ${Object.keys(licenseKeys).length} license keys.`)
  if (!process.env.LICENSE_KEY_STORE_PATH) console.log('Dev keys: VSL-DEV-BASIC-2026, VSL-DEV-PRO-2026')
})
