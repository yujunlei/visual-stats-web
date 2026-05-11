const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('visualStatsDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
})
