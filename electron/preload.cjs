const { contextBridge, ipcRenderer } = require('electron')

const allowedChannels = {
  runProfessionalModel: 'professional-model:run',
  checkProfessionalEnvironment: 'professional-model:check-environment',
  installProfessionalDependencies: 'professional-model:install-dependencies',
  repairProfessionalPython: 'professional-model:repair-python',
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertModelIdPayload(payload) {
  if (!isPlainObject(payload) || typeof payload.modelId !== 'string' || !/^[\w.-]+$/.test(payload.modelId)) {
    throw new Error('Invalid model payload.')
  }
}

function assertRunPayload(payload) {
  assertModelIdPayload(payload)
  if (typeof payload.taskId !== 'string' || !Array.isArray(payload.rows) || !isPlainObject(payload.config)) {
    throw new Error('Invalid professional model run payload.')
  }
}

function assertInstallPayload(payload) {
  assertModelIdPayload(payload)
  if (payload.scope !== 'lightweight' && payload.scope !== 'professional') {
    throw new Error('Invalid install scope.')
  }
}

contextBridge.exposeInMainWorld('visualStatsDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  runProfessionalModel(payload) {
    assertRunPayload(payload)
    return ipcRenderer.invoke(allowedChannels.runProfessionalModel, payload)
  },
  checkProfessionalEnvironment(payload) {
    assertModelIdPayload(payload)
    return ipcRenderer.invoke(allowedChannels.checkProfessionalEnvironment, payload)
  },
  installProfessionalDependencies(payload) {
    assertInstallPayload(payload)
    return ipcRenderer.invoke(allowedChannels.installProfessionalDependencies, payload)
  },
  repairProfessionalPython() {
    return ipcRenderer.invoke(allowedChannels.repairProfessionalPython)
  },
})
