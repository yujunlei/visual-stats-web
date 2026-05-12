const fs = require('node:fs')
const path = require('node:path')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

function getElectron() {
  const electron = require('electron')
  if (typeof electron === 'string') {
    throw new Error('Electron runtime APIs are unavailable outside the Electron main process.')
  }
  return electron
}

function writeLog(message) {
  try {
    const { app } = getElectron()
    const logDir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(path.join(logDir, 'main.log'), `${new Date().toISOString()} ${message}\n`)
  } catch {
    // Logging should never block app startup.
  }
}

function createExternalUrlDecision(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        allowed: false,
        reason: 'unsupported-protocol',
        protocol: parsed.protocol,
        logMessage: `blocked-external-url protocol=${parsed.protocol} url=${url}`,
      }
    }
    return { allowed: true, url: parsed.toString(), protocol: parsed.protocol }
  } catch (error) {
    return {
      allowed: false,
      reason: 'invalid-url',
      logMessage: `blocked-external-url invalid url=${url} error=${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function openExternalUrl(url, dependencies = {}) {
  const decision = createExternalUrlDecision(url)
  const log = dependencies.writeLog || writeLog
  const externalShell = dependencies.shell || getElectron().shell

  if (!decision.allowed) {
    log(decision.logMessage)
    return false
  }

  externalShell.openExternal(decision.url).catch((error) => log(`open-external-error ${error.message}`))
  return true
}

function createBrowserWindowWebPreferences(preloadPath) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  }
}

function createWindow(electron = getElectron()) {
  const { BrowserWindow } = electron
  writeLog(`create-window dev=${isDev}`)
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: 'Visual Stats Lab',
    backgroundColor: '#f4f6f2',
    show: false,
    webPreferences: createBrowserWindowWebPreferences(path.join(__dirname, 'preload.cjs')),
  })

  const showWindow = () => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
      writeLog('window-shown')
    }
  }

  mainWindow.once('ready-to-show', () => {
    writeLog('ready-to-show')
    showWindow()
  })

  setTimeout(showWindow, 3000)

  mainWindow.webContents.on('did-finish-load', () => writeLog('did-finish-load'))
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeLog(`did-fail-load code=${errorCode} description=${errorDescription} url=${validatedURL}`)
    showWindow()
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })
  mainWindow.on('unresponsive', () => writeLog('window-unresponsive'))
  mainWindow.on('closed', () => writeLog('window-closed'))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL).catch((error) => {
      writeLog(`load-url-error ${error.message}`)
      showWindow()
    })
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')
    writeLog(`load-file ${indexPath}`)
    mainWindow.loadFile(indexPath).catch((error) => {
      writeLog(`load-file-error ${error.message}`)
      showWindow()
    })
  }
}

function createMenu(electron = getElectron()) {
  const { app, Menu } = electron
  const template = [
    {
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: 'File',
      submenu: [{ role: 'close' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function startApplication(electron = getElectron()) {
  const { app, BrowserWindow } = electron

  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('no-stdio-init')
  app.commandLine.appendSwitch('disable-gpu')

  app.whenReady().then(() => {
    writeLog(`app-ready platform=${process.platform} arch=${process.arch} version=${app.getVersion()}`)
    app.setName('Visual Stats Lab')
    createMenu(electron)
    createWindow(electron)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(electron)
      }
    })
  })

  app.on('window-all-closed', () => {
    writeLog('window-all-closed')
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  process.on('uncaughtException', (error) => {
    writeLog(`uncaughtException ${error.stack || error.message}`)
  })

  process.on('unhandledRejection', (reason) => {
    writeLog(`unhandledRejection ${reason instanceof Error ? reason.stack : String(reason)}`)
  })
}

if (require.main === module) {
  startApplication()
}

module.exports = {
  createBrowserWindowWebPreferences,
  createExternalUrlDecision,
  openExternalUrl,
}
