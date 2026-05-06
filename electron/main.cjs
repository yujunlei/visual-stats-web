const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron')
const { spawn } = require('node:child_process')
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

function professionalBackendScriptPath() {
  return isDev
    ? path.join(app.getAppPath(), 'backend', 'professional_backend.py')
    : path.join(process.resourcesPath, 'backend', 'professional_backend.py')
}

function professionalEnvironmentScriptPath() {
  return isDev
    ? path.join(app.getAppPath(), 'backend', 'environment_check.py')
    : path.join(process.resourcesPath, 'backend', 'environment_check.py')
}

function professionalInstallerScriptPath() {
  return isDev
    ? path.join(app.getAppPath(), 'backend', 'install_dependencies.py')
    : path.join(process.resourcesPath, 'backend', 'install_dependencies.py')
}

function pythonCandidates() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    return [
      { command: 'py.exe', args: ['-3.11'] },
      { command: 'py.exe', args: ['-3.10'] },
      { command: path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'), args: [] },
      { command: path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'), args: [] },
      { command: path.join(programFiles, 'Python311', 'python.exe'), args: [] },
      { command: path.join(programFiles, 'Python310', 'python.exe'), args: [] },
      { command: 'python3.exe', args: [] },
      { command: 'python.exe', args: [] },
      { command: 'python', args: [] },
    ]
  }

  return [
    { command: 'python3.11', args: [] },
    { command: 'python3.10', args: [] },
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
  ]
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      if (!settled) {
        settled = true
        reject(new Error('命令运行超时，请检查网络、权限或 Python 环境。'))
      }
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      if (!settled) {
        settled = true
        reject(error)
      }
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (!settled) {
        settled = true
        resolve({ code, stdout, stderr })
      }
    })

    if (input) child.stdin.write(input)
    child.stdin.end()
  })
}

async function runPythonScript(scriptPath, payload, timeoutMs) {
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python 脚本不存在：${scriptPath}`)
  }

  const failures = []
  for (const candidate of pythonCandidates()) {
    try {
      const result = await runProcess(candidate.command, [...candidate.args, scriptPath], JSON.stringify(payload), timeoutMs)
      if (result.code !== 0) {
        failures.push(`${candidate.command} ${candidate.args.join(' ')}: ${result.stderr.trim() || `退出码 ${result.code}`}`)
        continue
      }
      try {
        return JSON.parse(result.stdout)
      } catch (error) {
        failures.push(`${candidate.command} ${candidate.args.join(' ')}: 返回格式无法解析 ${error.message}`)
      }
    } catch (error) {
      failures.push(`${candidate.command} ${candidate.args.join(' ')}: ${error.message}`)
    }
  }

  throw new Error(`无法找到可用的 Python 3.10+ 运行专业后端。已尝试：${failures.slice(0, 4).join('；')}`)
}

function runPythonBackend(payload) {
  return runPythonScript(professionalBackendScriptPath(), payload, 180000)
}

function checkPythonEnvironment(payload) {
  return runPythonScript(professionalEnvironmentScriptPath(), payload, 30000)
}

function installPythonDependencies(payload) {
  return runPythonScript(professionalInstallerScriptPath(), payload, 960000)
}

async function repairPythonRuntime() {
  if (process.platform !== 'win32') {
    return {
      success: false,
      message: '当前自动修复 Python 只支持 Windows。请手动安装 Python 3.10 或 3.11 后重新检测。',
      stdout: '',
      stderr: '',
    }
  }

  try {
    const result = await runProcess(
      'winget',
      ['install', '--id', 'Python.Python.3.11', '-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements'],
      '',
      960000,
    )
    return {
      success: result.code === 0,
      message: result.code === 0 ? 'Python 3.11 安装完成，请点击重新检测。' : 'Python 3.11 自动安装失败，请查看日志。',
      stdout: result.stdout.slice(-6000),
      stderr: result.stderr.slice(-6000),
      returnCode: result.code,
    }
  } catch (error) {
    return {
      success: false,
      message: error.message || 'Python 3.11 自动安装失败。',
      stdout: '',
      stderr: '',
    }
  }
}

function registerProfessionalBackend() {
  ipcMain.handle('professional-model:run', async (_event, payload) => {
    writeLog(`professional-model model=${payload?.modelId || 'unknown'}`)
    return runPythonBackend(payload)
  })
  ipcMain.handle('professional-model:check-environment', async (_event, payload) => {
    writeLog(`professional-env model=${payload?.modelId || 'unknown'}`)
    return checkPythonEnvironment(payload)
  })
  ipcMain.handle('professional-model:install-dependencies', async (_event, payload) => {
    writeLog(`professional-install model=${payload?.modelId || 'unknown'} scope=${payload?.scope || 'professional'}`)
    return installPythonDependencies(payload)
  })
  ipcMain.handle('professional-model:repair-python', async () => {
    writeLog('professional-repair-python')
    return repairPythonRuntime()
  })
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
  registerProfessionalBackend()
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
