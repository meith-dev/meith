/**
 * F36 — the storage policy, which is the part of this package that decides
 * whether a security fix reaches a two-million-post board on deploy or after a
 * migration.
 */
import { describe, expect, it } from 'vitest'

import { BodyFormat, RENDER_VERSION, postBodyHtml, sourceAsMarkdown } from './body'
import { compileVocabulary } from './vocabulary'

const current = {
  message: '**fresh**',
  messageHtml: '<p>stored</p>',
  renderVersion: RENDER_VERSION,
  bodyFormat: BodyFormat.Markdown,
}

describe('postBodyHtml', () => {
  it('serves the stored render when every stamp is current', () => {
    expect(postBodyHtml(current)).toBe('<p>stored</p>')
  })

  it('renders live when the renderer has moved on', () => {
    /*
     * The property that makes an escaping fix deployable: a render from an
     * older version is not shown, whatever it contains.
     */
    expect(postBodyHtml({ ...current, renderVersion: RENDER_VERSION - 1 })).toContain(
      '<strong>fresh</strong>',
    )
  })

  it('renders live when there is no stored render at all', () => {
    expect(postBodyHtml({ ...current, messageHtml: null })).toContain('<strong>fresh</strong>')
  })

  it('renders live when the board vocabulary has changed under it', () => {
    const vocabulary = compileVocabulary({ revision: 4, smilies: [], directives: [] })
    expect(postBodyHtml({ ...current, vocabVersion: 1 }, vocabulary)).toContain(
      '<strong>fresh</strong>',
    )
  })

  it('ignores the stored render of a body still stored as BBCode', () => {
    /*
     * Whatever version it claims: a renderer that no longer exists produced it.
     * The source is converted on the way through until the backfill rewrites it.
     */
    const html = postBodyHtml({
      message: 'a [b]bold[/b] claim',
      messageHtml: '<p>stale</p>',
      renderVersion: RENDER_VERSION,
      bodyFormat: BodyFormat.LegacyBBCode,
    })

    expect(html).toBe('<p>a <strong>bold</strong> claim</p>')
  })
})

describe('sourceAsMarkdown', () => {
  it('defaults to Markdown when a caller says nothing', () => {
    /*
     * The direction matters. A legacy row read as Markdown shows a few `[b]`
     * tags until the backfill reaches it — visible, harmless, self-healing. A
     * Markdown row read as BBCode would come back with its asterisks escaped,
     * which is a permanent corruption of somebody's post.
     */
    expect(sourceAsMarkdown('a * b', undefined)).toBe('a * b')
  })

  it('converts only when the row says it is BBCode', () => {
    expect(sourceAsMarkdown('[b]x[/b]', BodyFormat.LegacyBBCode)).toBe('**x**')
    expect(sourceAsMarkdown('[b]x[/b]', BodyFormat.Markdown)).toBe('[b]x[/b]')
  })
})
