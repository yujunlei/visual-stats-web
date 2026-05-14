const api = window.visualStatsPackager

const state = {
  context: null,
  keyDirectory: '',
  enabledModelPacks: new Set(['core', 'advanced', 'experimental']),
  enabledModelIds: new Set(),
  disabledModelIds: new Set(),
}

const $ = (id) => document.getElementById(id)

function appendTextElement(parent, tagName, text, className = '') {
  const element = document.createElement(tagName)
  if (className) element.className = className
  element.textContent = text
  parent.appendChild(element)
  return element
}

function appendLog(message, kind = 'info') {
  const output = $('logOutput')
  if (output.textContent === '等待操作...') output.textContent = ''
  output.textContent += `[${kind}] ${String(message).trim()}\n`
  output.scrollTop = output.scrollHeight
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key] || '其他'
    groups[value] = groups[value] || []
    groups[value].push(item)
    return groups
  }, {})
}

function currentProfile() {
  return {
    productName: $('productName').value,
    appId: $('appId').value,
    version: $('version').value,
    licenseServerUrl: $('licenseServerUrl').value,
    publicKeyPem: $('publicKeyPem').value,
    enabledModelPacks: Array.from(state.enabledModelPacks),
    enabledModelIds: Array.from(state.enabledModelIds),
    disabledModelIds: Array.from(state.disabledModelIds),
    targetPlatform: $('targetPlatform').value,
    createdAt: new Date().toISOString(),
  }
}

function updateSummary() {
  const selectedModelCount = state.context.models.filter(
    (model) => !state.disabledModelIds.has(model.id) && (state.enabledModelPacks.has(model.packId) || state.enabledModelIds.has(model.id)),
  ).length
  $('summaryModels').textContent = `${selectedModelCount} 个模型`
  $('summaryPacks').textContent = Array.from(state.enabledModelPacks).join(' / ') || '未选择模型包'
}

function renderPacks() {
  const container = $('packList')
  container.innerHTML = ''
  Object.entries(state.context.modelPacks).forEach(([packId, meta]) => {
    const label = document.createElement('label')
    label.className = 'pack-option'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = state.enabledModelPacks.has(packId)
    label.appendChild(input)
    appendTextElement(label, 'strong', meta.label)
    appendTextElement(label, 'span', meta.description)
    input.addEventListener('change', (event) => {
      if (event.target.checked) state.enabledModelPacks.add(packId)
      else state.enabledModelPacks.delete(packId)
      renderModels()
      updateSummary()
    })
    container.appendChild(label)
  })
}

function renderModels() {
  const container = $('modelList')
  container.innerHTML = ''
  const grouped = groupBy(state.context.models, 'taskGroup')
  Object.entries(grouped).forEach(([group, models]) => {
    const section = document.createElement('section')
    section.className = 'model-group'
    appendTextElement(section, 'h3', group)
    models.forEach((model) => {
      const includedByPack = state.enabledModelPacks.has(model.packId)
      const disabled = state.disabledModelIds.has(model.id)
      const selected = !disabled && (includedByPack || state.enabledModelIds.has(model.id))
      const card = document.createElement('label')
      card.className = `model-option ${selected ? 'is-selected' : ''} ${includedByPack ? 'is-packaged' : ''} ${disabled ? 'is-disabled-override' : ''}`
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = selected
      card.appendChild(input)
      const body = document.createElement('span')
      appendTextElement(body, 'strong', `${model.name || model.id}${model.shortName ? ` · ${model.shortName}` : ''}`)
      appendTextElement(
        body,
        'small',
        `${model.packId} · ${model.maturityLevel} · ${model.id}${disabled ? ' · 已从包中剔除' : includedByPack ? ' · 来自模型包' : ' · 单模型增补'}`,
      )
      appendTextElement(body, 'em', model.useCase || model.description || '')
      card.appendChild(body)
      input.addEventListener('change', (event) => {
        if (includedByPack) {
          if (event.target.checked) state.disabledModelIds.delete(model.id)
          else state.disabledModelIds.add(model.id)
        } else if (event.target.checked) {
          state.enabledModelIds.add(model.id)
          state.disabledModelIds.delete(model.id)
        } else {
          state.enabledModelIds.delete(model.id)
        }
        renderModels()
        updateSummary()
      })
      section.appendChild(card)
    })
    container.appendChild(section)
  })
  updateSummary()
}

function hydrateForm(context) {
  const profile = context.existingProfile || {
    productName: context.defaultProductName,
    appId: context.defaultAppId,
    version: context.packageVersion,
    licenseServerUrl: 'https://license.visualstatslab.com',
    publicKeyPem: '',
    enabledModelPacks: ['core', 'advanced', 'experimental'],
    enabledModelIds: [],
    targetPlatform: 'win',
  }
  $('productName').value = profile.productName || context.defaultProductName
  $('appId').value = profile.appId || context.defaultAppId
  $('version').value = profile.version || context.packageVersion
  $('licenseServerUrl').value = profile.licenseServerUrl || 'https://license.visualstatslab.com'
  $('publicKeyPem').value = profile.publicKeyPem || ''
  $('targetPlatform').value = profile.targetPlatform || 'win'
  state.enabledModelPacks = new Set(profile.enabledModelPacks || ['core', 'advanced', 'experimental'])
  state.enabledModelIds = new Set(profile.enabledModelIds || [])
  state.disabledModelIds = new Set(profile.disabledModelIds || [])
}

async function init() {
  state.context = await api.getContext()
  hydrateForm(state.context)
  renderPacks()
  renderModels()

  api.onLog((entry) => appendLog(entry.message, entry.kind))

  $('selectKeyDirectoryButton').addEventListener('click', async () => {
    const directory = await api.selectDirectory()
    if (!directory) return
    state.keyDirectory = directory
    $('keyDirectoryText').textContent = directory
  })

  $('generateKeypairButton').addEventListener('click', async () => {
    if (!state.keyDirectory) {
      appendLog('请先选择密钥保存目录。', 'stderr')
      return
    }
    const result = await api.generateKeypair(state.keyDirectory)
    $('publicKeyPem').value = result.publicKeyPem
    appendLog(`公钥已保存：${result.publicKeyPath}`, 'success')
    appendLog(`私钥已保存：${result.privateKeyPath}`, 'success')
  })

  $('saveProfileButton').addEventListener('click', async () => {
    const result = await api.saveProfile(currentProfile())
    appendLog(`Product profile 已保存：${result.profilePath}`, 'success')
    appendLog(`Vite profile env 已保存：${result.envPath}`, 'success')
  })

  $('generateLicenseButton').addEventListener('click', async () => {
    if (!state.keyDirectory) {
      appendLog('请先选择授权记录导出目录。', 'stderr')
      return
    }
    const result = await api.generateLicenseRecords(
      {
        plan: $('licensePlan').value,
        count: $('licenseCount').value,
        durationDays: $('durationDays').value,
        offlineGraceDays: $('offlineGraceDays').value,
        maxActivations: $('maxActivations').value,
        note: $('licenseNote').value,
        enabledModelPacks: Array.from(state.enabledModelPacks),
        enabledModelIds: Array.from(state.enabledModelIds),
      },
      state.keyDirectory,
    )
    appendLog(`授权 JSON 已导出：${result.files.jsonPath}`, 'success')
    appendLog(`授权 CSV 已导出：${result.files.csvPath}`, 'success')
  })

  $('runPackageButton').addEventListener('click', async () => {
    $('runPackageButton').disabled = true
    try {
      const result = await api.runPackage(currentProfile())
      appendLog(`Windows 安装包流水线完成：${result.releaseDirectory}`, 'success')
    } catch (error) {
      appendLog(error?.message || error, 'stderr')
    } finally {
      $('runPackageButton').disabled = false
    }
  })
}

init().catch((error) => appendLog(error?.message || error, 'stderr'))
