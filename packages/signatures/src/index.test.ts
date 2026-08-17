import { describe, expect, it } from 'vitest'

import { ValidationError } from '@meith/core'
import { BodyFormat, RENDER_VERSION } from '@meith/markdown'

import type { SignatureLimits, StoredSignature } from './index'
import { prepareSignature, SIGNATURE_HARD_MAX, signatureHtml, signatureLimit } from './index'

const ALLOWED: SignatureLimits = { canUse: true, maxLength: 200 }

function stored(overrides: Partial<StoredSignature> = {}): StoredSignature {
  return {
    signature: 'Hello',
    signatureHtml: '<p>Hello</p>',
    signatureRenderVersion: RENDER_VERSION,
    locked: false,
    lockedReason: null,
    ...overrides,
  }
}

describe('the restricted construct set', () => {
  it('keeps the styling a signature needs', () => {
    const { rendered } = prepareSignature('**bold** *and* [a link](https://x.test)', ALLOWED)

    expect(rendered.html).toContain('<strong>bold</strong>')
    expect(rendered.html).toContain('<em>and</em>')
    expect(rendered.html).toContain('href="https://x.test"')
  })

  it('drops the image and keeps its words, rather than refusing the save', () => {
    const { rendered } = prepareSignature('**hi** ![a photo](https://x.test/a.png)', ALLOWED)

    expect(rendered.html).toContain('<strong>hi</strong>')
    expect(rendered.html).not.toContain('<img')
    expect(rendered.html).toContain('a photo')
  })

  it('leaves the block constructs as the characters they are', () => {
    const { rendered } = prepareSignature('# Shouting\n> quoted\n- listed', ALLOWED)

    expect(rendered.html).not.toContain('<h2')
    expect(rendered.html).not.toContain('<blockquote')
    expect(rendered.html).not.toContain('<ul')
    expect(rendered.html).toContain('# Shouting')
  })

  it('still escapes what it renders as text', () => {
    const { rendered } = prepareSignature('<script>alert(1)</script>', ALLOWED)
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('&lt;script&gt;')
  })
})

describe('signatureLimit', () => {
  it('uses the group limit when it is lower than the ceiling', () => {
    expect(signatureLimit({ canUse: true, maxLength: 100 })).toBe(100)
  })

  it('treats 0 as unlimited, which means the hard ceiling', () => {
    expect(signatureLimit({ canUse: true, maxLength: 0 })).toBe(SIGNATURE_HARD_MAX)
  })

  it('never exceeds the hard ceiling, whatever a group says', () => {
    expect(signatureLimit({ canUse: true, maxLength: 999_999 })).toBe(SIGNATURE_HARD_MAX)
  })
})

describe('prepareSignature', () => {
  it('refuses a group that may not have one', () => {
    expect(() => prepareSignature('Hello', { canUse: false, maxLength: 200 })).toThrow(
      ValidationError,
    )
  })

  it('measures the raw source, not the rendered HTML', () => {
    const source = `**${'x'.repeat(90)}**`
    expect(source.length).toBeLessThanOrEqual(100)

    const { rendered } = prepareSignature(source, { canUse: true, maxLength: 100 })
    expect(rendered.html.length).toBeGreaterThan(100)
  })

  it('refuses one over the limit and says by how much', () => {
    expect(() => prepareSignature('x'.repeat(201), ALLOWED)).toThrow(/at most 200/)
  })

  it('trims, so trailing newlines do not spend the limit', () => {
    const { source } = prepareSignature('  Hello  \n', ALLOWED)
    expect(source).toBe('Hello')
  })

  it('stamps the render with the current version', () => {
    const { rendered } = prepareSignature('Hello', ALLOWED)
    expect(rendered.version).toBe(RENDER_VERSION)
  })
})

describe('signatureHtml', () => {
  it('uses the stored render when it is current', () => {
    expect(signatureHtml(stored({ signatureHtml: '<p>cached</p>' }))).toBe('<p>cached</p>')
  })

  it('renders live when the stored one is from an older renderer', () => {
    const html = signatureHtml(
      stored({ signature: '**fresh**', signatureHtml: '<p>stale</p>', signatureRenderVersion: 0 }),
    )
    expect(html).toContain('<strong>fresh</strong>')
  })

  it('renders live when there is no stored render at all', () => {
    expect(signatureHtml(stored({ signature: 'plain', signatureHtml: null }))).toContain('plain')
  })

  it('shows nothing for a locked signature, without deleting it', () => {
    const locked = stored({ locked: true, lockedReason: 'Advertising.' })
    expect(signatureHtml(locked)).toBeNull()
    expect(locked.signature).toBe('Hello')
  })

  it('shows nothing for an empty one, rather than an empty container', () => {
    expect(signatureHtml(stored({ signature: '   ', signatureHtml: '' }))).toBeNull()
  })

  it('converts a signature still stored as BBCode, and does not trust its render', () => {
    const html = signatureHtml(
      stored({
        signature: '[b]old[/b]',
        signatureHtml: '<p>stale</p>',
        signatureFormat: BodyFormat.LegacyBBCode,
      }),
    )

    expect(html).toContain('<strong>old</strong>')
  })
})
