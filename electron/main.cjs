const { app, BrowserWindow, Menu, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('no-stdio-init')
app.commandLine.appendSwitch('disable-gpu')

function writeLog(message) {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(path.join(logDir, 'main.log'), `${new Date().toISOString()} ${message}\n`)
  } catch {
    // Logging should never block app startup.
  }
}

function createWindow() {
  writeLog(`create-window dev=${isDev}`)
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: 'Visual Stats Lab',
    backgroundColor: '#f4f6f2',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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
    shell.openExternal(url)
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

function createMenu() {
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

app.whenReady().then(() => {
  writeLog(`app-ready platform=${process.platform} arch=${process.arch} version=${app.getVersion()}`)
  app.setName('Visual Stats Lab')
  createMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
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
