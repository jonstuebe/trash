// Builds public/favicon-v2.ico from public/favicon-v2.svg, for browsers that don't
// use SVG favicons (Safari). Run `bun run favicon` after editing the SVG and
// commit the result. The app and install icons come from public/icon.svg via
// vite-plugin-pwa at build time instead.

import sharp from 'sharp'

const SOURCE = 'public/favicon-v2.svg'
const OUTPUT = 'public/favicon-v2.ico'
const SIZES = [16, 32, 48]

const pngs = await Promise.all(
  SIZES.map(size =>
    sharp(SOURCE, { density: 600 }).resize(size, size).png().toBuffer(),
  ),
)

// An ICO file is a 6-byte header, a 16-byte directory entry per image, then
// the images. Modern ICO readers accept PNG-encoded images as-is.
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(pngs.length, 4)

let offset = header.length + 16 * pngs.length
const entries = pngs.map((png, index) => {
  const size = SIZES[index] ?? 0
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size, 0)
  entry.writeUInt8(size, 1)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += png.length
  return entry
})

await Bun.write(OUTPUT, Buffer.concat([header, ...entries, ...pngs]))
console.log(`Wrote ${OUTPUT} (${SIZES.join(', ')}px)`)
