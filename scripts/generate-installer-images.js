const path = require('path')
const fs = require('fs')
const Jimp = require('jimp')

function setPixel(data, width, x, y, r, g, b, a = 255) {
  const i = (y * width + x) * 4
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)))
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

function fillGradient(data, width, x0, y0, x1, y1, c1, c2, dir = 'v') {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const t = dir === 'v' ? (y - y0) / (y1 - y0) : (x - x0) / (x1 - x0)
      const e = easeInOut(t)
      setPixel(data, width, x, y,
        lerp(c1[0], c2[0], e),
        lerp(c1[1], c2[1], e),
        lerp(c1[2], c2[2], e),
      )
    }
  }
}

function compositeAlpha(base, overlay, ox, oy) {
  const { data: bd, width: bw, height: bh } = base.bitmap
  const { data: od, width: ow, height: oh } = overlay.bitmap
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const dx = ox + x; const dy = oy + y
      if (dx < 0 || dy < 0 || dx >= bw || dy >= bh) continue
      const si = (y * ow + x) * 4
      const di = (dy * bw + dx) * 4
      const a = od[si + 3] / 255
      bd[di]     = lerp(bd[di],     od[si],     a)
      bd[di + 1] = lerp(bd[di + 1], od[si + 1], a)
      bd[di + 2] = lerp(bd[di + 2], od[si + 2], a)
    }
  }
}

function writeBmp24(img, outputPath) {
  const { width, height, data } = img.bitmap
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const buf = Buffer.alloc(54 + pixelDataSize, 0)

  buf[0] = 0x42; buf[1] = 0x4d
  buf.writeUInt32LE(54 + pixelDataSize, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(pixelDataSize, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)

  for (let y = 0; y < height; y++) {
    const bmpRow = height - 1 - y
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4
      const d = 54 + bmpRow * rowSize + x * 3
      buf[d] = data[s + 2]; buf[d + 1] = data[s + 1]; buf[d + 2] = data[s]
    }
  }
  fs.writeFileSync(outputPath, buf)
}

async function main() {
  const src = await Jimp.read(path.join(__dirname, '../build/Pulsar.png'))

  const DARK    = [11, 11, 17]    // #0b0b11
  const MID     = [17, 16, 28]    // #11101c
  const PURPLE1 = [109, 40, 217]  // #6d28d9
  const PURPLE2 = [167, 139, 250] // #a78bfa

  // ── Sidebar: 164×314 ──────────────────────────────────────────────────────
  const sb = new Jimp(164, 314, 0x000000ff)
  const { data: sbd, width: sbw, height: sbh } = sb.bitmap

  // Background gradient top-to-bottom
  fillGradient(sbd, sbw, 0, 0, sbw, sbh, MID, DARK, 'v')

  // Left accent bar — purple gradient top to bottom, 4px wide
  fillGradient(sbd, sbw, 0, 0, 4, sbh, PURPLE2, PURPLE1, 'v')

  // Subtle horizontal glow band behind icon (y 70–200), blended purple tint
  for (let y = 70; y < 200; y++) {
    const t = 1 - Math.abs((y - 135) / 65)
    const alpha = t * 0.08
    for (let x = 4; x < sbw; x++) {
      const i = (y * sbw + x) * 4
      sbd[i]     = lerp(sbd[i],     PURPLE1[0], alpha)
      sbd[i + 1] = lerp(sbd[i + 1], PURPLE1[1], alpha)
      sbd[i + 2] = lerp(sbd[i + 2], PURPLE1[2], alpha)
    }
  }

  // Thin bottom accent line
  fillGradient(sbd, sbw, 4, sbh - 2, sbw, sbh, PURPLE1, PURPLE2, 'h')

  // Icon centered, upper-third
  const sIcon = src.clone().resize(108, 108, Jimp.RESIZE_LANCZOS3)
  compositeAlpha(sb, sIcon, 28, 86)

  writeBmp24(sb, path.join(__dirname, '../build/installerSidebar.bmp'))
  console.log('Generated installerSidebar.bmp (164x314)')

  // ── Header: 150×57 ────────────────────────────────────────────────────────
  const hd = new Jimp(150, 57, 0x000000ff)
  const { data: hdd, width: hdw, height: hdh } = hd.bitmap

  // Background gradient left-to-right (darker on left, slightly lighter on right)
  fillGradient(hdd, hdw, 0, 0, hdw, hdh, DARK, MID, 'h')

  // Right-side purple glow
  for (let x = 80; x < hdw; x++) {
    const t = (x - 80) / (hdw - 80)
    const alpha = t * 0.18
    for (let y = 0; y < hdh; y++) {
      const i = (y * hdw + x) * 4
      hdd[i]     = lerp(hdd[i],     PURPLE1[0], alpha)
      hdd[i + 1] = lerp(hdd[i + 1], PURPLE1[1], alpha)
      hdd[i + 2] = lerp(hdd[i + 2], PURPLE1[2], alpha)
    }
  }

  // Bottom accent line full width
  fillGradient(hdd, hdw, 0, hdh - 2, hdw, hdh, PURPLE1, PURPLE2, 'h')

  // Left accent bar 3px
  fillGradient(hdd, hdw, 0, 0, 3, hdh - 2, PURPLE2, PURPLE1, 'v')

  // Icon right-aligned
  const hIcon = src.clone().resize(38, 38, Jimp.RESIZE_LANCZOS3)
  compositeAlpha(hd, hIcon, 103, 9)

  writeBmp24(hd, path.join(__dirname, '../build/installerHeader.bmp'))
  console.log('Generated installerHeader.bmp (150x57)')
}

main().catch((err) => {
  console.error('Failed to generate installer images:', err.message)
  process.exit(1)
})
