const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('visualStatsPackager', {
  getContext: () => ipcRenderer.invoke('packager:get-context'),
  selectDirectory: () => ipcRenderer.invoke('packager:select-directory'),
  generateKeypair: (directory) => ipcRenderer.invoke('packager:generate-keypair', directory),
  saveProfile: (profile) => ipcRenderer.invoke('packager:save-profile', profile),
  generateLicenseRecords: (input, directory) => ipcRenderer.invoke('packager:generate-license-records', input, directory),
  runPackage: (profile) => ipcRenderer.invoke('packager:run-package', profile),
  onLog: (listener) => {
    const wrapped = (_event, entry) => listener(entry)
    ipcRenderer.on('packager:log', wrapped)
    return () => ipcRenderer.removeListener('packager:log', wrapped)
  },
})
