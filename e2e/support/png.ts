import { deflateSync } from 'node:zlib'

/**
 * A real PNG, built here rather than imported or checked in.
 *
 * Three options were available and two are worse. **Importing the codec** is
 * what this started as, and Playwright loads spec files as CommonJS while
 * `locate-wasm.ts` uses `import.meta.url`, so the spec would not load. **A
 * checked-in binary fixture** is a file nobody reviews and nobody can tell has
 * gone stale. So: forty lines of PNG, from `node:zlib`, which every Node has.
 *
 * It is a genuine PNG — signature, `IHDR`, a zlib-compressed `IDAT` with the
 * per-scanline filter byte, `IEND`, and a real CRC on each chunk — because the
 * point of the test is that libpng decodes it. A near-miss would be refused at
 * the header and prove nothing.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))

  return Buffer.concat([length, typed, crc])
}

/**
 * An RGBA PNG of `width` x `height`, filled with a gradient.
 *
 * A gradient rather than a flat colour so the re-encoded output has a different
 * size from the input — which is what a test asserting "this was re-encoded"
 * needs in order to be able to fail.
 */
export function samplePng(width = 600, height = 400): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  header[10] = 0 // deflate
  header[11] = 0 // adaptive filtering
  header[12] = 0 // no interlace

  /* One filter byte per scanline, then RGBA. Filter 0 is "none". */
  const raw = Buffer.alloc(height * (1 + width * 4))
  let at = 0
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0
    at += 1
    for (let x = 0; x < width; x += 1) {
      raw[at] = (x * 7) % 256
      raw[at + 1] = (y * 13) % 256
      raw[at + 2] = ((x + y) * 3) % 256
      raw[at + 3] = 255
      at += 4
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
