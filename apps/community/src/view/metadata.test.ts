/**
 * F76's canonical URLs and structured data.
 *
 * The claim worth a suite of its own is the canonical, because the wrong
 * version of it is the single most common way a community ends up with only its
 * first pages in a search index: pointing every page of a thread at page 1
 * asks a crawler to drop the rest of the conversation. What the canonical
 * *should* drop is the surplus — a permalink, a cursor and a reveal parameter
 * are three URLs for one document.
 */
import { describe, expect, it } from 'vitest'

import {
  canonicalPath,
  cardDescription,
  jsonLdScript,
  pageLinks,
  threadJsonLd,
} from './metadata'

const PATH = '/thread/12-hello'

describe('canonicalPath', () => {
  it('points at the page being read, not at page one', () => {
    /*
     * The claim. Page 4 of a thread is a distinct document with distinct
     * content, and a canonical that names page 1 tells a crawler to index one
     * quarter of the thread. Kills the mutant that always returns the bare path.
     */
    expect(canonicalPath({ path: PATH, page: 4 })).toBe(`${PATH}?page=4`)
  })

  it('leaves page one as the bare path', () => {
    /*
     * `?page=1` also works, but every link on the board points at the bare
     * path, and a canonical that disagrees with the site's own links is one the
     * crawler has to arbitrate.
     */
    expect(canonicalPath({ path: PATH, page: 1 })).toBe(PATH)
  })

  it('treats a nonsense page as the first', () => {
    expect(canonicalPath({ path: PATH, page: 0 })).toBe(PATH)
    expect(canonicalPath({ path: PATH, page: -3 })).toBe(PATH)
  })

  it('carries no parameter but the page', () => {
    /*
     * The surplus this is meant to collapse. `?post=812`, `?after=…` and
     * `?reveal=…` are three ways to reach one document, and the canonical is
     * what tells a crawler they are the same page.
     */
    expect(canonicalPath({ path: PATH, page: 2 })).not.toContain('post')
    expect(canonicalPath({ path: PATH, page: 2 })).not.toContain('after')
  })
})

describe('pageLinks', () => {
  it('offers prev only when there is a previous page', () => {
    expect(pageLinks({ path: PATH, page: 1, hasNext: true }).previous).toBeNull()
    expect(pageLinks({ path: PATH, page: 2, hasNext: false }).previous).toBe(PATH)
  })

  it('links page three back to page two, not to page one', () => {
    /*
     * Kills the mutant that returns the bare path for every `prev` — which
     * turns a ten-page thread into a two-node chain and makes the sequence
     * unwalkable.
     */
    expect(pageLinks({ path: PATH, page: 3, hasNext: false }).previous).toBe(`${PATH}?page=2`)
  })

  it('offers next only when the caller says there is one', () => {
    expect(pageLinks({ path: PATH, page: 1, hasNext: false }).next).toBeNull()
    expect(pageLinks({ path: PATH, page: 1, hasNext: true }).next).toBe(`${PATH}?page=2`)
  })
})

describe('cardDescription', () => {
  it('falls back when the post is gone or empty', () => {
    expect(cardDescription(null, 'fallback')).toBe('fallback')
    expect(cardDescription('   ', 'fallback')).toBe('fallback')
    /* Markup that renders to nothing is also nothing. */
    expect(cardDescription('****', 'fallback')).toBe('fallback')
  })

  it('strips the markup rather than showing it', () => {
    expect(cardDescription('**Hello** there', 'x')).toBe('Hello there')
  })

  it('truncates on a word boundary at the platforms’ limit', () => {
    const out = cardDescription(`${'word '.repeat(100)}end`, 'x')

    expect(out.length).toBeLessThanOrEqual(201)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('threadJsonLd', () => {
  const input = {
    title: 'Hello </script><script>alert(1)</script>',
    url: '/thread/12-hello',
    author: 'ann',
    published: new Date('2026-01-01T00:00:00Z'),
    modified: new Date('2026-02-01T00:00:00Z'),
    replyCount: 4,
    communityTitle: 'Open',
    description: 'A discussion.',
  }

  it('escapes a title that would close the script element', () => {
    /*
     * This test found a real hole rather than confirming one. `JSON.stringify`
     * escapes quotes and backslashes and **does not escape the forward slash**,
     * so a thread titled `</script><script>…` serialises to exactly that text
     * and the HTML parser ends the JSON-LD block at the first `</script`. The
     * JSON is well formed the whole time; the injection is in the layer under
     * it. Kills the mutant that serialises with `JSON.stringify` alone.
     */
    const out = jsonLdScript(threadJsonLd(input))

    expect(out).not.toContain('</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('\\u003c')
    /* Still valid JSON with the same value — the escape is a JSON escape. */
    expect((JSON.parse(out) as { headline: string }).headline).toBe(input.title)
  })

  it('escapes the line separators a JavaScript parser treats as newlines', () => {
    /*
     * U+2028 and U+2029 are legal inside a JSON string and are literal line
     * terminators to a JavaScript parser — the same bug as above wearing
     * different characters, and the one everybody forgets.
     */
    const out = jsonLdScript(threadJsonLd({ ...input, title: 'a\u2028b\u2029c' }))

    expect(out).not.toContain('\u2028')
    expect((JSON.parse(out) as { headline: string }).headline).toBe('a\u2028b\u2029c')
  })

  it('separates published from modified', () => {
    /*
     * A thread from January with a reply in February is a year-old discussion
     * that is still live. Collapsing the two dates loses whichever half the
     * consumer cares about.
     */
    const record = threadJsonLd(input)

    expect(record.datePublished).toBe('2026-01-01T00:00:00.000Z')
    expect(record.dateModified).toBe('2026-02-01T00:00:00.000Z')
  })

  it('counts replies as an interaction statistic', () => {
    /*
     * `interactionStatistic` is what the vocabulary specifies for a reply
     * count; a bare `commentCount` is widely copied and quietly ignored.
     */
    expect(record(threadJsonLd(input))).toMatchObject({
      '@type': 'InteractionCounter',
      userInteractionCount: 4,
    })
  })

  it('declares the type consumers look for', () => {
    expect(threadJsonLd(input)['@type']).toBe('DiscussionCommunityPosting')
  })
})

function record(json: Record<string, unknown>): Record<string, unknown> {
  return json.interactionStatistic as Record<string, unknown>
}
