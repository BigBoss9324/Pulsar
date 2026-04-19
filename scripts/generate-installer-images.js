const path = require('path')
const Jimp = require('jimp')

const BG = 0x111111ff

function createBlank(w, h) {
  return new Promise((resolve, reject) => {
    new Jimp(w, h, BG, (err, img) => (err ? reject(err) : resolve(img)))
  })
}

async function main() {
  const src = await Jimp.read(path.join(__dirname, '../build/Pulsar.png'))

  // Header: 150x57 — icon left-aligned with padding
  const hIcon = src.clone().resize(38, 38, Jimp.RESIZE_LANCZOS3)
  const header = await createBlank(150, 57)
  header.composite(hIcon, 9, 9, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1,
  })
  await header.writeAsync(path.join(__dirname, '../build/installerHeader.bmp'))
  console.log('Generated installerHeader.bmp (150x57)')

  // Sidebar: 164x314 — large icon centered horizontally, upper-third vertically
  const sIcon = src.clone().resize(104, 104, Jimp.RESIZE_LANCZOS3)
  const sidebar = await createBlank(164, 314)
  sidebar.composite(sIcon, 30, 88, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1,
  })
  await sidebar.writeAsync(path.join(__dirname, '../build/installerSidebar.bmp'))
  console.log('Generated installerSidebar.bmp (164x314)')
}

main().catch((err) => {
  console.error('Failed to generate installer images:', err.message)
  process.exit(1)
})
