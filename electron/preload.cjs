const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('visualStatsDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  runProfessionalModel(payload) {
    return ipcRenderer.invoke('professional-model:run', payload)
  },
  checkProfessionalEnvironment(payload) {
    return ipcRenderer.invoke('professional-model:check-environment', payload)
  },
  installProfessionalDependencies(payload) {
    return ipcRenderer.invoke('professional-model:install-dependencies', payload)
  },
  repairProfessionalPython() {
    return ipcRenderer.invoke('professional-model:repair-python')
  },
})
