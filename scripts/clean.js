const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '../release')
try {
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('Cleaned release directory')
} catch {
  console.warn('Warning: could not clean release directory (files may be open). Continuing...')
}
