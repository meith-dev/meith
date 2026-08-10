import { describe, expect, it } from 'vitest'

import { decodeImage, encodeImage, resizeToFit, type DecodedImage } from './codec'

function gradient(width: number, height: number): DecodedImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4
      data[at] = Math.round((x / Math.max(1, width - 1)) * 255)
      data[at + 1] = Math.round((y / Math.max(1, height - 1)) * 255)
      data[at + 2] = 128
      data[at + 3] = 255
    }
  }
  return { width, height, data, colorSpace: 'srgb' }
}

function bytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer)
}

function includes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

describe('round trip', () => {
  it('encodes and decodes a PNG losslessly', async () => {
    const source = gradient(24, 16)
    const decoded = await decodeImage(await encodeImage(source, 'png'), 'png')

    expect(decoded.width).toBe(24)
    expect(decoded.height).toBe(16)
    expect(Array.from(decoded.data)).toEqual(Array.from(source.data))
  }, 30_000)

  it('encodes and decodes a JPEG, which is lossy but the right size', async () => {
    const source = gradient(24, 16)
    const decoded = await decodeImage(await encodeImage(source, 'jpeg'), 'jpeg')

    expect(decoded.width).toBe(24)
    expect(decoded.height).toBe(16)
    expect(decoded.data[0]).toBeLessThan(40)
  }, 30_000)

  it('writes the magic bytes of the format it was asked for', async () => {
    const source = gradient(8, 8)

    expect(Array.from(bytes(await encodeImage(source, 'png')).slice(0, 4))).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ])
    expect(Array.from(bytes(await encodeImage(source, 'jpeg')).slice(0, 2))).toEqual([
      0xff, 0xd8,
    ])
  }, 30_000)

  it('converts between formats', async () => {
    const png = await encodeImage(gradient(16, 16), 'png')
    const asJpeg = await encodeImage(await decodeImage(png, 'png'), 'jpeg')

    expect(bytes(asJpeg)[0]).toBe(0xff)
  }, 30_000)
})

describe('re-encoding is what makes an upload safe', () => {
  it('drops anything appended to the original file', async () => {
    const payload = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('MALICIOUS-PAYLOAD'),
    ])
    const original = bytes(await encodeImage(gradient(16, 16), 'png'))

    const polyglot = new Uint8Array(original.length + payload.length)
    polyglot.set(original)
    polyglot.set(payload, original.length)
    expect(includes(polyglot, payload)).toBe(true)

    const safe = bytes(
      await encodeImage(await decodeImage(polyglot.buffer as ArrayBuffer, 'png'), 'png'),
    )

    expect(includes(safe, payload)).toBe(false)
  }, 30_000)

  it('refuses bytes that are not an image of the claimed format', async () => {
    const notAnImage = new TextEncoder().encode('<?php system($_GET["c"]); ?>')

    await expect(
      decodeImage(notAnImage.buffer as ArrayBuffer, 'png'),
    ).rejects.toBeDefined()
  }, 30_000)

  it('refuses a PNG decoded as a JPEG', async () => {
    const png = await encodeImage(gradient(8, 8), 'png')
    await expect(decodeImage(png, 'jpeg')).rejects.toBeDefined()
  }, 30_000)
})

describe('resizeToFit', () => {
  it('scales down to fit the box', async () => {
    const small = await resizeToFit(gradient(400, 200), { width: 100, height: 100 })

    expect(small.width).toBe(100)
    expect(small.height).toBe(50)
  }, 30_000)

  it('is bound by the tighter dimension, not the looser one', async () => {
    const small = await resizeToFit(gradient(200, 400), { width: 100, height: 100 })

    expect(small.width).toBeLessThanOrEqual(100)
    expect(small.height).toBeLessThanOrEqual(100)
    expect(small.height).toBe(100)
  }, 30_000)

  it('never scales up, and returns the original untouched', async () => {
    const source = gradient(40, 40)
    expect(await resizeToFit(source, { width: 200, height: 200 })).toBe(source)
  }, 30_000)

  it('leaves an exact fit alone', async () => {
    const source = gradient(100, 100)
    expect(await resizeToFit(source, { width: 100, height: 100 })).toBe(source)
  }, 30_000)

  it('never rounds a dimension to zero', async () => {
    const thin = await resizeToFit(gradient(1000, 1), { width: 50, height: 50 })

    expect(thin.width).toBe(50)
    expect(thin.height).toBe(1)
    expect(bytes(await encodeImage(thin, 'png')).length).toBeGreaterThan(0)
  }, 30_000)

  it('produces something that re-encodes and decodes back at the new size', async () => {
    const small = await resizeToFit(gradient(240, 120), { width: 60, height: 60 })
    const decoded = await decodeImage(await encodeImage(small, 'png'), 'png')

    expect([decoded.width, decoded.height]).toEqual([60, 30])
  }, 30_000)
})

describe('quality', () => {
  it('is honoured, so a thumbnail can be cheaper than the original', async () => {
    const source = gradient(120, 120)
    const low = await encodeImage(source, 'jpeg', 30)
    const high = await encodeImage(source, 'jpeg', 95)

    expect(low.byteLength).toBeLessThan(high.byteLength)
  }, 30_000)
})
