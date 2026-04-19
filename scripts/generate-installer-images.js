const path = require('path')
const fs = require('fs')
const Jimp = require('jimp')

const BG_R = 0x11
const BG_G = 0x11
const BG_B = 0x11

function writeBmp24(img, outputPath) {
  const { width, height, data } = img.bitmap
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const fileSize = 54 + pixelDataSize
  const buf = Buffer.alloc(fileSize, 0)

  // File header
  buf[0] = 0x42; buf[1] = 0x4d
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(54, 10)

  // DIB header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22) // positive = bottom-up rows
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(pixelDataSize, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)

  // Pixel data — BMP is bottom-up, BGR order
  for (let y = 0; y < height; y++) {
    const bmpRow = height - 1 - y
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const a = data[src + 3] / 255
      // Blend alpha onto solid background
      const r = Math.round(data[src + 0] * a + BG_R * (1 - a))
      const g = Math.round(data[src + 1] * a + BG_G * (1 - a))
      const b = Math.round(data[src + 2] * a + BG_B * (1 - a))
      const dest = 54 + bmpRow * rowSize + x * 3
      buf[dest] = b
      buf[dest + 1] = g
      buf[dest + 2] = r
    }
  }

  fs.writeFileSync(outputPath, buf)
}

async function main() {
  const src = await Jimp.read(path.join(__dirname, '../build/Pulsar.png'))

  // Header: 150x57 — icon left-aligned with padding
  const hIcon = src.clone().resize(38, 38, Jimp.RESIZE_LANCZOS3)
  const header = new Jimp(150, 57, 0x111111ff)
  header.composite(hIcon, 9, 9, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 1, opacityDest: 1 })
  writeBmp24(header, path.join(__dirname, '../build/installerHeader.bmp'))
  console.log('Generated installerHeader.bmp (150x57)')

  // Sidebar: 164x314 — large icon centered horizontally, upper-third vertically
  const sIcon = src.clone().resize(104, 104, Jimp.RESIZE_LANCZOS3)
  const sidebar = new Jimp(164, 314, 0x111111ff)
  sidebar.composite(sIcon, 30, 88, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 1, opacityDest: 1 })
  writeBmp24(sidebar, path.join(__dirname, '../build/installerSidebar.bmp'))
  console.log('Generated installerSidebar.bmp (164x314)')
}

main().catch((err) => {
  console.error('Failed to generate installer images:', err.message)
  process.exit(1)
})
