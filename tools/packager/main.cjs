const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '../..')
let mainWindow = null
let activePackageJob = null

const packIds = ['core', 'advanced', 'experimental']

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true })
}

function parseModelCatalog() {
  const catalogPath = path.join(projectRoot, 'src/models/catalog.ts')
  const raw = fs.readFileSync(catalogPath, 'utf8')
  const entries = []
  const entryRegex =
    /\{\s*id:\s*'([^']+)'[\s\S]*?taskGroup:\s*'([^']+)'[\s\S]*?packId:\s*'([^']+)'[\s\S]*?modelVersion:\s*'([^']+)'[\s\S]*?maturityLevel:\s*'([^']+)'[\s\S]*?enabledByDefault:\s*(true|false)[\s\S]*?useCase:\s*'([^']*)'/g
  let match = entryRegex.exec(raw)
  while (match) {
    entries.push({
      id: match[1],
      taskGroup: match[2],
      packId: match[3],
      modelVersion: match[4],
      maturityLevel: match[5],
      enabledByDefault: match[6] === 'true',
      useCase: match[7],
    })
    match = entryRegex.exec(raw)
  }
  return entries
}

function readPluginMeta() {
  const pluginRoot = path.join(projectRoot, 'src/models/plugins')
  const metas = new Map()
  const files = fs.readdirSync(pluginRoot).filter((file) => file.endsWith('.ts'))
  for (const file of files) {
    const raw = fs.readFileSync(path.join(pluginRoot, file), 'utf8')
    const id = raw.match(/id:\s*'([^']+)'/)?.[1]
    if (!id) continue
    metas.set(id, {
      name: raw.match(/name:\s*'([^']+)'/)?.[1] || id,
      shortName: raw.match(/shortName:\s*'([^']+)'/)?.[1] || '',
      description: raw.match(/description:\s*'([^']+)'/)?.[1] || '',
    })
  }
  return metas
}

function getModelManifest() {
  const catalogEntries = parseModelCatalog()
  const pluginMeta = readPluginMeta()
  return catalogEntries.map((entry) => ({
    ...entry,
    ...(pluginMeta.get(entry.id) || { name: entry.id, shortName: '', description: '' }),
  }))
}

function normalizeProfile(input = {}) {
  const packageJson = readJson(path.join(projectRoot, 'package.json'), {})
  const enabledModelPacks = Array.isArray(input.enabledModelPacks)
    ? Array.from(new Set(input.enabledModelPacks.filter((pack) => packIds.includes(pack))))
    : packIds
  const enabledModelIds = Array.isArray(input.enabledModelIds)
    ? Array.from(new Set(input.enabledModelIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())))
    : []
  const disabledModelIds = Array.isArray(input.disabledModelIds)
    ? Array.from(new Set(input.disabledModelIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())))
    : []

  return {
    productName: typeof input.productName === 'string' && input.productName.trim() ? input.productName.trim() : 'Visual Stats Lab',
    appId: typeof input.appId === 'string' && input.appId.trim() ? input.appId.trim() : packageJson.build?.appId || 'com.visualstats.lab',
    version: typeof input.version === 'string' && input.version.trim() ? input.version.trim() : packageJson.version || '0.1.0',
    licenseServerUrl:
      typeof input.licenseServerUrl === 'string' && input.licenseServerUrl.trim()
        ? input.licenseServerUrl.trim()
        : 'https://license.visualstatslab.com',
    publicKeyPem: typeof input.publicKeyPem === 'string' ? input.publicKeyPem : '',
    enabledModelPacks: enabledModelPacks.length > 0 ? enabledModelPacks : packIds,
    enabledModelIds,
    disabledModelIds,
    targetPlatform: input.targetPlatform === 'mac' || input.targetPlatform === 'linux' ? input.targetPlatform : 'win',
    createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : new Date().toISOString(),
  }
}

function saveProductProfile(inputProfile) {
  const profile = normalizeProfile(inputProfile)
  const buildDirectory = path.join(projectRoot, 'build')
  ensureDirectory(buildDirectory)
  const profilePath = path.join(buildDirectory, 'product-profile.json')
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
  const envPath = path.join(projectRoot, '.env.production.local')
  fs.writeFileSync(envPath, `VITE_PRODUCT_PROFILE_JSON=${JSON.stringify(JSON.stringify(profile))}\n`, 'utf8')
  return { profile, profilePath, envPath }
}

function generateKeypair(directory) {
  ensureDirectory(directory)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const privateKeyPath = path.join(directory, `visual-stats-private-key-${timestamp}.pem`)
  const publicKeyPath = path.join(directory, `visual-stats-public-key-${timestamp}.pem`)
  fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600 })
  fs.writeFileSync(publicKeyPath, publicKey, 'utf8')
  return { publicKeyPem: publicKey, publicKeyPath, privateKeyPath }
}

function createLicenseKey(plan) {
  const prefix = `VSL-${String(plan || 'PRO').toUpperCase().replace(/[^A-Z0-9]+/g, '')}`
  const token = crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{1,4}/g).join('-')
  return `${prefix}-${token}`
}

function generateLicenseRecords(input = {}) {
  const count = Math.min(Math.max(Number(input.count) || 1, 1), 500)
  const now = new Date().toISOString()
  return Array.from({ length: count }, () => ({
    licenseKey: createLicenseKey(input.plan),
    plan: String(input.plan || 'professional'),
    durationDays: Math.max(Number(input.durationDays) || 365, 1),
    offlineGraceDays: Math.max(Number(input.offlineGraceDays) || 30, 1),
    enabledModelPacks: Array.isArray(input.enabledModelPacks) ? input.enabledModelPacks.filter((pack) => packIds.includes(pack)) : ['core'],
    enabledModelIds: Array.isArray(input.enabledModelIds) ? input.enabledModelIds.filter((id) => typeof id === 'string' && id.trim()) : [],
    maxActivations: Math.max(Number(input.maxActivations) || 1, 1),
    note: typeof input.note === 'string' ? input.note : '',
    createdAt: now,
  }))
}

function exportLicenseRecords(records, directory) {
  ensureDirectory(directory)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const jsonPath = path.join(directory, `license-keys-${timestamp}.json`)
  const csvPath = path.join(directory, `license-keys-${timestamp}.csv`)
  fs.writeFileSync(jsonPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
  const header = ['licenseKey', 'plan', 'durationDays', 'offlineGraceDays', 'enabledModelPacks', 'enabledModelIds', 'maxActivations', 'note', 'createdAt']
  const rows = records.map((record) =>
    header
      .map((key) => {
        const value = Array.isArray(record[key]) ? record[key].join('|') : record[key]
        return `"${String(value ?? '').replace(/"/g, '""')}"`
      })
      .join(','),
  )
  fs.writeFileSync(csvPath, `${header.join(',')}\n${rows.join('\n')}\n`, 'utf8')
  return { jsonPath, csvPath }
}

function sendLog(sender, message, kind = 'info') {
  sender.send('packager:log', { kind, message, time: new Date().toISOString() })
}

function runCommand(sender, command, args) {
  return new Promise((resolve, reject) => {
    sendLog(sender, `> ${command} ${args.join(' ')}`)
    const child = spawn(command, args, { cwd: projectRoot, env: process.env, shell: false })
    child.stdout.on('data', (chunk) => sendLog(sender, chunk.toString(), 'stdout'))
    child.stderr.on('data', (chunk) => sendLog(sender, chunk.toString(), 'stderr'))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}

async function runPackagingPipeline(sender) {
  if (activePackageJob) throw new Error('已有打包任务正在运行。')
  activePackageJob = Promise.resolve()
  try {
    const steps = [
      ['npm', ['run', 'test']],
      ['npm', ['run', 'typecheck']],
      ['npm', ['run', 'lint']],
      ['npm', ['run', 'build']],
      ['npx', ['electron-builder', '--win', 'nsis']],
    ]
    for (const [command, args] of steps) {
      await runCommand(sender, command, args)
    }
    const releaseDirectory = path.join(projectRoot, 'release')
    sendLog(sender, `打包完成。输出目录：${releaseDirectory}`, 'success')
    return { ok: true, releaseDirectory }
  } finally {
    activePackageJob = null
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: 'Visual Stats Packager Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.loadFile(path.join(__dirname, 'index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('packager:get-context', () => {
    const packageJson = readJson(path.join(projectRoot, 'package.json'), {})
    const existingProfile = readJson(path.join(projectRoot, 'build/product-profile.json'), null)
    return {
      projectRoot,
      packageVersion: packageJson.version || '0.1.0',
      defaultProductName: packageJson.build?.productName || 'Visual Stats Lab',
      defaultAppId: packageJson.build?.appId || 'com.visualstats.lab',
      modelPacks: {
        core: { label: '核心模型包', description: '通用统计、差异检验、相关关系和基础回归。' },
        advanced: { label: '进阶模型包', description: '面板、固定效应和机制检验。' },
        experimental: { label: '实验模型包', description: '空间、门槛和复杂扩展模型。' },
      },
      models: getModelManifest(),
      existingProfile: existingProfile ? normalizeProfile(existingProfile) : null,
    }
  })

  ipcMain.handle('packager:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('packager:generate-keypair', (_event, directory) => {
    if (!directory || typeof directory !== 'string') throw new Error('请选择密钥保存目录。')
    return generateKeypair(directory)
  })

  ipcMain.handle('packager:save-profile', (_event, profile) => saveProductProfile(profile))

  ipcMain.handle('packager:generate-license-records', (_event, input, directory) => {
    if (!directory || typeof directory !== 'string') throw new Error('请选择授权记录导出目录。')
    const records = generateLicenseRecords(input)
    const files = exportLicenseRecords(records, directory)
    return { records, files }
  })

  ipcMain.handle('packager:run-package', async (event, profile) => {
    if (profile) saveProductProfile(profile)
    return runPackagingPipeline(event.sender)
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
