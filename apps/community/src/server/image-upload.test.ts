import { describe, expect, it } from 'vitest'

import { contentTypeFor, imageHeaders, sniff } from './image-upload'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)

describe('sniff', () => {
  it('recognises the raster formats by signature', () => {
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d))?.contentType).toBe('image/png')
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))?.contentType).toBe('image/jpeg')
    expect(
      sniff(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))?.contentType,
    ).toBe('image/webp')
  })

  it('refuses a RIFF container that is not WebP', () => {
    expect(sniff(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull()
  })

  it('accepts SVG, with or without an XML declaration or a byte-order mark', () => {
    expect(sniff(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))?.extension).toBe('svg')
    expect(sniff(text('<?xml version="1.0"?>\n<svg></svg>'))?.extension).toBe('svg')
    expect(sniff(text('﻿  <svg></svg>'))?.extension).toBe('svg')
  })

  it('refuses markup that is not SVG', () => {
    expect(sniff(text('<html><body>hello</body></html>'))).toBeNull()
    expect(sniff(text('GIF89a'))).toBeNull()
    expect(sniff(new Uint8Array())).toBeNull()
  })

  it('refuses an SVG carrying script, a handler or a javascript: URL', () => {
    for (const payload of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"></svg>',
      '<svg><foreignObject><body/></foreignObject></svg>',
      '<svg><a href="javascript:alert(1)">x</a></svg>',
    ]) {
      expect(() => sniff(text(payload)), payload).toThrow(/script or an event handler/)
    }
  })

  it('refuses a SMIL element setting an event handler, not just a literal on*=', () => {
    for (const payload of [
      '<svg><set attributeName="onload" to="alert(1)"/></svg>',
      '<svg><animate attributeName="onmouseover" to="alert(1)"/></svg>',
    ]) {
      expect(() => sniff(text(payload)), payload).toThrow(/script or an event handler/)
    }
  })

  it('refuses an entity-encoded javascript: scheme', () => {
    const payload = '<svg><a xlink:href="&#106;avascript:alert(1)">x</a></svg>'
    expect(() => sniff(text(payload))).toThrow(/script or an event handler/)
  })

  it('refuses <use> or <image> pointing outside the file, but allows a local fragment', () => {
    for (const payload of [
      '<svg><use href="https://evil.example/x.svg#p"/></svg>',
      '<svg><image href="data:image/svg+xml;base64,QQ=="/></svg>',
    ]) {
      expect(() => sniff(text(payload)), payload).toThrow(/references an external file/)
    }

    expect(sniff(text('<svg><symbol id="i"/><use href="#i"/></svg>'))?.extension).toBe('svg')
  })
})

describe('serving', () => {
  it('serves a stored key as the format its extension records', () => {
    expect(contentTypeFor('board/logo-light-abc.svg')).toBe('image/svg+xml')
    expect(contentTypeFor('group/3/badge-dark-abc.png')).toBe('image/png')
    expect(contentTypeFor('board/logo-light-abc')).toBe('application/octet-stream')
  })

  it('locks down every image it serves, whatever the format', () => {
    const headers = imageHeaders('group/1/badge-light-abc.svg', 120) as Record<string, string>

    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Content-Security-Policy']).toContain('sandbox')
    expect(headers['Cache-Control']).toContain('immutable')
  })
})
