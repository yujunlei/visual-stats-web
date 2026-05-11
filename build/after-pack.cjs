const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') {
    const plistPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Info.plist')
    const plistBuddy = '/usr/libexec/PlistBuddy'

    execFileSync(plistBuddy, ['-c', 'Set :NSAppTransportSecurity:NSAllowsArbitraryLoads false', plistPath])
    execFileSync(plistBuddy, ['-c', 'Set :NSAppTransportSecurity:NSAllowsLocalNetworking true', plistPath])
  }
}
