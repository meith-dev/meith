import { describe, expect, it } from 'vitest'

import { canonicalPath, cardDescription, jsonLdScript, pageLinks, threadJsonLd } from './metadata'

const PATH = '/thread/12-hello'

describe('canonicalPath', () => {
  it('points at the page being read, not at page one', () => {
    expect(canonicalPath({ path: PATH, page: 4 })).toBe(`${PATH}?page=4`)
  })

  it('leaves page one as the bare path', () => {
    expect(canonicalPath({ path: PATH, page: 1 })).toBe(PATH)
  })

  it('treats a nonsense page as the first', () => {
    expect(canonicalPath({ path: PATH, page: 0 })).toBe(PATH)
    expect(canonicalPath({ path: PATH, page: -3 })).toBe(PATH)
  })

  it('carries no parameter but the page', () => {
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
    forumTitle: 'Open',
    description: 'A discussion.',
  }

  it('escapes a title that would close the script element', () => {
    const out = jsonLdScript(threadJsonLd(input))

    expect(out).not.toContain('</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('\\u003c')
    expect((JSON.parse(out) as { headline: string }).headline).toBe(input.title)
  })

  it('escapes the line separators a JavaScript parser treats as newlines', () => {
    const out = jsonLdScript(threadJsonLd({ ...input, title: 'a\u2028b\u2029c' }))

    expect(out).not.toContain('\u2028')
    expect((JSON.parse(out) as { headline: string }).headline).toBe('a\u2028b\u2029c')
  })

  it('separates published from modified', () => {
    const record = threadJsonLd(input)

    expect(record.datePublished).toBe('2026-01-01T00:00:00.000Z')
    expect(record.dateModified).toBe('2026-02-01T00:00:00.000Z')
  })

  it('counts replies as an interaction statistic', () => {
    expect(record(threadJsonLd(input))).toMatchObject({
      '@type': 'InteractionCounter',
      userInteractionCount: 4,
    })
  })

  it('declares the type consumers look for', () => {
    expect(threadJsonLd(input)['@type']).toBe('DiscussionForumPosting')
  })
})

function record(json: Record<string, unknown>): Record<string, unknown> {
  return json.interactionStatistic as Record<string, unknown>
}
