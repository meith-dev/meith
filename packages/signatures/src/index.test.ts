import { ValidationError } from '@forum/core'
import { RENDER_VERSION } from '@forum/bbcode'
import { describe, expect, it } from 'vitest'

import {
  SIGNATURE_HARD_MAX,
  SIGNATURE_TAGS,
  prepareSignature,
  signatureHtml,
  signatureLimit,
} from './index'
import type { SignatureLimits, StoredSignature } from './index'

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

describe('the restricted tag set', () => {
  it('keeps the styling tags a signature needs', () => {
    for (const tag of ['b', 'i', 'u', 's', 'color', 'url', 'email']) {
      expect(SIGNATURE_TAGS[tag]).toBeDefined()
    }
  })

  it('leaves out the ones that would repeat on every post', () => {
    /*
     * Each omission is the same argument: a signature appears under every post
     * its author has ever made. `img` is the important one — a remote image is
     * a tracking beacon that reports every reader's IP to whoever hosts it.
     */
    for (const tag of ['img', 'quote', 'size', 'code', 'list']) {
      expect(SIGNATURE_TAGS[tag]).toBeUndefined()
    }
  })

  it('renders a forbidden tag as literal text rather than refusing the save', () => {
    /*
     * The reason this is a registry rather than a validator: it cannot be
     * bypassed by a tag this build does not know, and a member pasting an old
     * signature gets most of it instead of an error.
     */
    const { rendered } = prepareSignature('[b]hi[/b] [img]http://x.test/a.png[/img]', ALLOWED)

    expect(rendered.html).toContain('<strong>hi</strong>')
    expect(rendered.html).not.toContain('<img')
    expect(rendered.html).toContain('[img]')
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
    /*
     * 0 means unlimited on every numeric permission (R4.2) — but "unlimited"
     * for a string that renders under every post is still bounded.
     */
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
    /*
     * A member types BBCode, and a limit they cannot count against is one they
     * cannot work with. It also means a renderer change can never retroactively
     * push somebody over.
     */
    const source = `[b]${'x'.repeat(90)}[/b]`
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
    /*
     * F36's rule, for the third table: a stale render is a live render, so a
     * renderer security fix takes effect on the next page load rather than
     * waiting for a backfill.
     */
    const html = signatureHtml(
      stored({ signature: '[b]fresh[/b]', signatureHtml: '<p>stale</p>', signatureRenderVersion: 0 }),
    )
    expect(html).toContain('<strong>fresh</strong>')
  })

  it('renders live when there is no stored render at all', () => {
    expect(signatureHtml(stored({ signature: 'plain', signatureHtml: null }))).toContain('plain')
  })

  it('shows nothing for a locked signature, without deleting it', () => {
    /*
     * The point of a lock rather than a delete: the text is kept so an appeal
     * can see what was there, and it does not render.
     */
    const locked = stored({ locked: true, lockedReason: 'Advertising.' })
    expect(signatureHtml(locked)).toBeNull()
    expect(locked.signature).toBe('Hello')
  })

  it('shows nothing for an empty one, rather than an empty container', () => {
    expect(signatureHtml(stored({ signature: '   ', signatureHtml: '' }))).toBeNull()
  })
})
