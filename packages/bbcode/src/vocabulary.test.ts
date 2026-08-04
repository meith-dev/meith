import { describe, expect, it } from 'vitest'

import { RENDER_VERSION, postBodyHtml, renderBBCode } from './body'
import { EMPTY_VOCABULARY, compileVocabulary, customTagNames } from './vocabulary'

const SMILE = { code: ':)', src: '/smilies/smile.png' }

function stored(html: string, vocabVersion = 0) {
  return { message: 'x', messageHtml: html, renderVersion: RENDER_VERSION, vocabVersion }
}

describe('compiling a board vocabulary', () => {
  it('is the core tag set and no smilies when nothing is configured', () => {
    const vocabulary = compileVocabulary({ revision: 0, smilies: [], customTags: [] })
    expect(vocabulary.smilies).toBeUndefined()
    expect(customTagNames(vocabulary)).toEqual([])
    expect(vocabulary.rejected).toEqual([])
  })

  it('adds custom tags without disturbing the core ones', () => {
    const vocabulary = compileVocabulary({
      revision: 3,
      smilies: [],
      customTags: [{ name: 'spoiler', block: true }],
    })

    expect(customTagNames(vocabulary)).toEqual(['spoiler'])
    expect(vocabulary.tags.url).toBeDefined()
  })
})

/*
 * Nothing in this module may throw: it runs on the render path, so one bad row
 * would take out every thread page on the board rather than costing one smiley.
 */
describe('a row that will not compile is dropped, never thrown', () => {
  it('drops a tag whose name collides with a core one, and keeps the others', () => {
    const vocabulary = compileVocabulary({
      revision: 1,
      smilies: [],
      customTags: [
        { name: 'spoiler', block: false },
        { name: 'url', block: false },
        { name: 'aside', block: true },
      ],
    })

    expect(customTagNames(vocabulary)).toEqual(['aside', 'spoiler'])
    expect(vocabulary.rejected).toEqual([
      { kind: 'tag', name: 'url', reason: expect.stringContaining('already exists') },
    ])
  })

  /*
   * The failure this guards against: an operator adds a tag with a bad name and
   * silently loses the three that already worked. Tags are therefore added one
   * at a time rather than in a single call.
   */
  it('does not let one bad tag take the good ones with it', () => {
    const vocabulary = compileVocabulary({
      revision: 1,
      smilies: [],
      customTags: [
        { name: 'good', block: false },
        { name: 'NOT A NAME', block: false },
      ],
    })

    expect(customTagNames(vocabulary)).toEqual(['good'])
  })

  it('drops a smiley with an unsafe image URL and keeps the rest', () => {
    const vocabulary = compileVocabulary({
      revision: 1,
      smilies: [SMILE, { code: ':evil:', src: 'javascript:alert(1)' }],
      customTags: [],
    })

    expect(vocabulary.smilies?.entries.map((entry) => entry.code)).toEqual([':)'])
    expect(vocabulary.rejected[0]).toMatchObject({ kind: 'smiley', name: ':evil:' })
  })

  it('drops a duplicate code rather than failing the whole set', () => {
    const vocabulary = compileVocabulary({
      revision: 1,
      smilies: [SMILE, { code: ':)', src: '/other.png' }],
      customTags: [],
    })

    expect(vocabulary.smilies?.entries).toHaveLength(1)
    expect(vocabulary.rejected).toHaveLength(1)
  })
})

describe('rendering with a vocabulary', () => {
  const vocabulary = compileVocabulary({
    revision: 7,
    smilies: [SMILE],
    customTags: [{ name: 'spoiler', block: false }],
  })

  it('expands a smiley in ordinary text', () => {
    const html = renderBBCode('hi :)', {
      tags: vocabulary.tags,
      ...(vocabulary.smilies === undefined ? {} : { smilies: vocabulary.smilies }),
    }).html
    expect(html).toContain('/smilies/smile.png')
  })

  it('renders a custom tag as the package’s own escaped element', () => {
    const html = renderBBCode('[spoiler]boo[/spoiler]', { tags: vocabulary.tags }).html
    expect(html).toContain('bb-custom-spoiler')
    expect(html).toContain('boo')
  })

  /* A tag the board has not configured is still demoted to its source text. */
  it('leaves an unconfigured tag as the literal markup its author typed', () => {
    const html = renderBBCode('[spoiler]boo[/spoiler]', {}).html
    expect(html).toContain('[spoiler]')
  })
})

describe('a stored render is current only if both stamps match', () => {
  const vocabulary = compileVocabulary({ revision: 7, smilies: [SMILE], customTags: [] })

  it('uses the stored render when the vocabulary matches', () => {
    expect(postBodyHtml(stored('<p>cached</p>', 7), vocabulary)).toBe('<p>cached</p>')
  })

  /*
   * The whole reason the column exists. A render made before the operator added
   * a smiley does not contain it, and serving it would make the new smiley
   * appear only on posts written since — which looks exactly like a broken
   * feature.
   */
  it('re-renders when the stored stamp is an older vocabulary', () => {
    const html = postBodyHtml({ ...stored('<p>cached</p>', 6), message: 'hi :)' }, vocabulary)
    expect(html).not.toBe('<p>cached</p>')
    expect(html).toContain('/smilies/smile.png')
  })

  it('re-renders when the renderer’s own version is stale, vocabulary or not', () => {
    const post = { message: 'hi', messageHtml: '<p>old</p>', renderVersion: -1, vocabVersion: 7 }
    expect(postBodyHtml(post, vocabulary)).not.toBe('<p>old</p>')
  })

  /*
   * Absent reads as 0, which is the column default and the revision of a board
   * that has configured nothing — so installing this feature does not make every
   * post on the board stale.
   */
  it('treats a missing stamp as revision 0, which a board with no vocabulary is', () => {
    const post = { message: 'hi', messageHtml: '<p>cached</p>', renderVersion: RENDER_VERSION }
    expect(postBodyHtml(post)).toBe('<p>cached</p>')
    expect(postBodyHtml(post, EMPTY_VOCABULARY)).toBe('<p>cached</p>')
  })

  /*
   * The safe direction. A caller that forgets to pass the vocabulary on a board
   * that has one gets a live render — slower, and right — rather than HTML
   * missing the board's smilies.
   */
  it('re-renders rather than serving a stale cache when the caller forgets it', () => {
    expect(postBodyHtml(stored('<p>cached</p>', 7))).not.toBe('<p>cached</p>')
  })
})
