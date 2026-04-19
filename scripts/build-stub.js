const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

function findMakensis() {
  // Check electron-builder's cached NSIS first
  const cache = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'nsis')
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache)) {
      const candidate = path.join(cache, dir, 'Bin', 'makensis.exe')
      if (fs.existsSync(candidate)) return candidate
    }
  }
  // Fall back to system PATH
  return 'makensis'
}

const makensis = findMakensis()
const nsi = path.resolve(__dirname, 'stub-installer.nsi')
const outDir = path.resolve(__dirname, '..', 'release')

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

console.log(`Building stub installer with: ${makensis}`)
try {
  execFileSync(makensis, [nsi], { stdio: 'inherit' })
  console.log(`\nDone. Output: release/PulsarSetup.exe`)
} catch {
  process.exit(1)
}
