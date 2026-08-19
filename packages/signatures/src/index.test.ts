import { describe, expect, it } from 'vitest'

import { ValidationError } from '@meith/core'
import { BodyFormat, RENDER_VERSION, type VocabularySource } from '@meith/markdown'

import type { SignatureLimits, StoredSignature } from './index'
import {
  prepareSignature,
  renderStoredSignature,
  SIGNATURE_HARD_MAX,
  signatureHtml,
  signatureLimit,
} from './index'

const AUTHOR = { authorId: 7 }

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
  it('keeps the styling a signature needs', async () => {
    const { rendered } = await prepareSignature(
      '**bold** *and* [a link](https://x.test)',
      ALLOWED,
      AUTHOR,
    )

    expect(rendered.html).toContain('<strong>bold</strong>')
    expect(rendered.html).toContain('<em>and</em>')
    expect(rendered.html).toContain('href="https://x.test"')
  })

  it('drops the image and keeps its words, rather than refusing the save', async () => {
    const { rendered } = await prepareSignature(
      '**hi** ![a photo](https://x.test/a.png)',
      ALLOWED,
      AUTHOR,
    )

    expect(rendered.html).toContain('<strong>hi</strong>')
    expect(rendered.html).not.toContain('<img')
    expect(rendered.html).toContain('a photo')
  })

  it('leaves the block constructs as the characters they are', async () => {
    const { rendered } = await prepareSignature('# Shouting\n> quoted\n- listed', ALLOWED, AUTHOR)

    expect(rendered.html).not.toContain('<h2')
    expect(rendered.html).not.toContain('<blockquote')
    expect(rendered.html).not.toContain('<ul')
    expect(rendered.html).toContain('# Shouting')
  })

  it('still escapes what it renders as text', async () => {
    const { rendered } = await prepareSignature('<script>alert(1)</script>', ALLOWED, AUTHOR)
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
  it('refuses a group that may not have one', async () => {
    await expect(
      prepareSignature('Hello', { canUse: false, maxLength: 200 }, AUTHOR),
    ).rejects.toThrow(ValidationError)
  })

  it('measures the raw source, not the rendered HTML', async () => {
    const source = `**${'x'.repeat(90)}**`
    expect(source.length).toBeLessThanOrEqual(100)

    const { rendered } = await prepareSignature(source, { canUse: true, maxLength: 100 }, AUTHOR)
    expect(rendered.html.length).toBeGreaterThan(100)
  })

  it('refuses one over the limit and says by how much', async () => {
    await expect(prepareSignature('x'.repeat(201), ALLOWED, AUTHOR)).rejects.toThrow(/at most 200/)
  })

  it('trims, so trailing newlines do not spend the limit', async () => {
    const { source } = await prepareSignature('  Hello  \n', ALLOWED, AUTHOR)
    expect(source).toBe('Hello')
  })

  it('stamps the render with the current version', async () => {
    const { rendered } = await prepareSignature('Hello', ALLOWED, AUTHOR)
    expect(rendered.version).toBe(RENDER_VERSION)
  })
})

describe('renderStoredSignature', () => {
  const shouting = {
    text: async (text: string) => text.replaceAll('[[name]]', 'Ada'),
    html: async (html: string) => `${html}<em>plugin</em>`,
    vocabulary: async (source: VocabularySource) => source,
  }

  it('hands back the stored render untouched when it is current', async () => {
    expect(await renderStoredSignature(stored({ signatureHtml: '<p>cached</p>' }), AUTHOR)).toBe(
      '<p>cached</p>',
    )
  })

  it('runs a stale one back through the pipeline rather than the bare renderer', async () => {
    const html = await renderStoredSignature(
      stored({ signature: 'by [[name]]', signatureHtml: null }),
      { ...AUTHOR, rendering: shouting },
    )

    expect(html).toContain('by Ada')
    expect(html).toContain('<em>plugin</em>')
  })

  it('shows nothing for a locked or empty signature', async () => {
    expect(await renderStoredSignature(stored({ locked: true }), AUTHOR)).toBeNull()
    expect(await renderStoredSignature(stored({ signature: '  ' }), AUTHOR)).toBeNull()
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
