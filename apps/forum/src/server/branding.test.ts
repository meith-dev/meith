/**
 * What the board will store as a logo, and which image a reader gets.
 *
 * Two things are worth pinning here and neither is CRUD:
 *
 *  - **the bytes decide the format.** A browser sends whatever content type the
 *    operating system guessed from the extension and an attacker sends whatever
 *    they like, so the declared type is discarded before it reaches this code.
 *    Every test below hands `sniff` a payload whose *name* would have said
 *    something else.
 *  - **the colour scheme is resolved on the server.** A theme doing it in CSS
 *    would be wrong for the commonest reader — the one on "system", who has no
 *    `.dark` class because their dark mode comes from a media query.
 */
import { describe, expect, it } from 'vitest'

import { logoSrc, resolveLogo, sniff } from './branding'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)

describe('sniff', () => {
  it('recognises the raster formats by signature', () => {
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d))?.contentType).toBe('image/png')
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))?.contentType).toBe('image/jpeg')
    /* WebP is RIFF with a WEBP tag four bytes later, not at the start. */
    expect(
      sniff(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))?.contentType,
    ).toBe('image/webp')
  })

  it('refuses a RIFF container that is not WebP', () => {
    /* A WAV file is RIFF too. Matching the first four bytes alone would take it. */
    expect(sniff(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull()
  })

  it('accepts SVG, with or without an XML declaration or a byte-order mark', () => {
    expect(sniff(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))?.extension).toBe('svg')
    expect(sniff(text('<?xml version="1.0"?>\n<svg></svg>'))?.extension).toBe('svg')
    expect(sniff(text('﻿  <svg></svg>'))?.extension).toBe('svg')
  })

  /*
   * The case that matters most, and the one a name-based check waves through:
   * markup uploaded as `logo.png`. Nothing here looks at the name.
   */
  it('refuses markup that is not SVG', () => {
    expect(sniff(text('<html><body>hello</body></html>'))).toBeNull()
    expect(sniff(text('GIF89a'))).toBeNull()
    expect(sniff(new Uint8Array())).toBeNull()
  })

  /*
   * The third of three defences — an SVG in an `<img>` cannot run script, and
   * the serving route sandboxes direct navigation — but the cheapest to check
   * and the only one visible in a diff.
   */
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
})

describe('logoSrc', () => {
  /*
   * `/logo/light` is a fixed path, so the query is the only thing that can make
   * a replaced logo a different URL — which is what lets the route send a
   * year-long `immutable`. Without it a board would keep showing the old logo
   * for as long as a cache felt like it.
   */
  it('changes when the stored key does', () => {
    const a = logoSrc('light', 'board/logo-light-11111111-1111-1111-1111-111111111111.png')
    const b = logoSrc('light', 'board/logo-light-22222222-2222-2222-2222-222222222222.png')

    expect(a).not.toBe(b)
    expect(a.startsWith('/logo/light?v=')).toBe(true)
  })
})

describe('resolveLogo', () => {
  const LIGHT = 'board/logo-light-11111111-1111-1111-1111-111111111111.png'
  const DARK = 'board/logo-dark-22222222-2222-2222-2222-222222222222.png'
  const base = { alt: '', boardTitle: 'The Townland' } as const

  it('is null when the board has no logo, which is most boards', () => {
    expect(resolveLogo({ ...base, lightKey: null, darkKey: null, scheme: 'system' })).toBeNull()
  })

  it('sends one image and no picture element when a scheme is forced', () => {
    /*
     * The server knows the answer, so it gives one. A `<picture>` here would be
     * a source selection with a single possible outcome.
     */
    const light = resolveLogo({ ...base, lightKey: LIGHT, darkKey: DARK, scheme: 'light' })
    const dark = resolveLogo({ ...base, lightKey: LIGHT, darkKey: DARK, scheme: 'dark' })

    expect(light?.darkSrc).toBeNull()
    expect(dark?.darkSrc).toBeNull()
    expect(light?.src).not.toBe(dark?.src)
  })

  it('defers to the media query only for a reader on "system"', () => {
    const resolved = resolveLogo({ ...base, lightKey: LIGHT, darkKey: DARK, scheme: 'system' })

    expect(resolved?.src).toContain('/logo/light')
    expect(resolved?.darkSrc).toContain('/logo/dark')
  })

  /*
   * An operator who has uploaded one image has said what they want the header
   * to be. Showing it on both backgrounds is a smaller surprise than falling
   * back to text on one of them.
   */
  it('uses the one image it has in both schemes', () => {
    const onlyLight = resolveLogo({ ...base, lightKey: LIGHT, darkKey: null, scheme: 'system' })
    expect(onlyLight?.src).toContain('/logo/light')
    expect(onlyLight?.darkSrc).toBeNull()

    const onlyDark = resolveLogo({ ...base, lightKey: null, darkKey: DARK, scheme: 'light' })
    expect(onlyDark?.src).toContain('/logo/dark')
  })

  /*
   * The header is the only link home on most pages, so an image link with no
   * text is a link a screen reader announces as its URL.
   */
  it('never hands the theme an empty alt', () => {
    const fallback = resolveLogo({ ...base, lightKey: LIGHT, darkKey: null, scheme: 'light' })
    expect(fallback?.alt).toBe('The Townland')

    const written = resolveLogo({
      ...base,
      alt: '  The Townland, in a circle  ',
      lightKey: LIGHT,
      darkKey: null,
      scheme: 'light',
    })
    expect(written?.alt).toBe('The Townland, in a circle')
  })
})
