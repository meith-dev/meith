/**
 * The image codecs, run for real.
 *
 * No mocking: these tests compile the same WebAssembly the board ships and put
 * real pixels through it. A faked codec would prove nothing — the risk ADR 0003
 * accepts is entirely about whether these modules load and behave, and a test
 * double is the one thing that cannot answer that.
 *
 * The security claim is the important one. **Re-encoding is what makes an
 * upload safe**, not validation: the output is written by the encoder from a
 * decoded bitmap, so anything appended to, prefixed to, or hidden in the
 * original file is simply absent from the result.
 */
import { describe, expect, it } from 'vitest'

import { decodeImage, encodeImage, resizeToFit, type DecodedImage } from './codec'

/** A gradient, so a resize has something to average and JPEG has detail. */
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
    /* Lossy: near, not equal. The corner pixel of a gradient is red 0. */
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
    /*
     * The polyglot: a valid PNG with a ZIP — or a script, or a shell — stuck on
     * the end. Every decoder stops at the image's own end marker, so the file
     * *is* a valid image and validation passes it. Only re-encoding removes the
     * payload, because the output is written from pixels and has never seen it.
     */
    /* A ZIP local file header, written as bytes: the two after `PK` are
       control characters and belong in source as numbers, not literals. */
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
    /* The type must be established before decode, not guessed by the codec. */
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
    /*
     * Kills the mutant that takes the *max* of the two ratios: a 200x400 image
     * into a 100x100 box would come out 100x200 and overflow the box in the
     * dimension nobody checked.
     */
    const small = await resizeToFit(gradient(200, 400), { width: 100, height: 100 })

    expect(small.width).toBeLessThanOrEqual(100)
    expect(small.height).toBeLessThanOrEqual(100)
    expect(small.height).toBe(100)
  }, 30_000)

  it('never scales up, and returns the original untouched', async () => {
    /*
     * A thumbnail of a 40x40 avatar must not be a blurry 200x200 one. Returning
     * the same object also means no encode happens for an image already inside
     * the box — the common case for avatars.
     */
    const source = gradient(40, 40)
    expect(await resizeToFit(source, { width: 200, height: 200 })).toBe(source)
  }, 30_000)

  it('leaves an exact fit alone', async () => {
    const source = gradient(100, 100)
    expect(await resizeToFit(source, { width: 100, height: 100 })).toBe(source)
  }, 30_000)

  it('never rounds a dimension to zero', async () => {
    /*
     * A 1000x1 banner into a 50x50 box scales by 0.05, and 1 * 0.05 rounds to
     * 0. An encoder handed a zero-height image throws, so the thumbnail of a
     * legitimate upload would fail — the clamp is what stops that.
     */
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
