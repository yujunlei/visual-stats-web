const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('visualStatsDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  license: {
    getStatus: () => ipcRenderer.invoke('license:get-status'),
    activate: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
    refresh: () => ipcRenderer.invoke('license:refresh'),
    startTrial: () => ipcRenderer.invoke('license:start-trial'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
  },
})
