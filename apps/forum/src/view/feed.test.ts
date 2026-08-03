/**
 * F76's XML serialisers.
 *
 * XML is the one output on this board React does not write, which makes
 * escaping the author's job — and a feed is consumed by parsers far stricter
 * than a browser. A bare `&` is not a warning there, it is a document that
 * fails to parse, and the content that produces it is a thread title somebody
 * typed. So the tests feed these functions the characters that break XML, and
 * the assertion is that the output does not contain them raw.
 */
import { describe, expect, it } from 'vitest'

import {
  renderAtom,
  renderRss,
  renderSitemap,
  renderSitemapIndex,
  summarise,
  xmlEscape,
} from './feed'

const AT = new Date('2026-05-05T12:00:00Z')

const entry = (overrides: Partial<Parameters<typeof renderRss>[0]['entries'][number]> = {}) => ({
  id: 'tag:example.test,2026:thread/1',
  title: 'Hello',
  href: 'https://example.test/thread/1-hello',
  author: 'ann',
  published: AT,
  updated: AT,
  summary: 'A summary.',
  ...overrides,
})

const channel = (entries: ReturnType<typeof entry>[]) => ({
  title: 'Forum',
  description: 'A board.',
  href: 'https://example.test/',
  selfHref: 'https://example.test/feed.xml',
  updated: AT,
  entries,
})

describe('xmlEscape', () => {
  it('escapes all five predefined entities', () => {
    expect(xmlEscape(`a & b < c > d " e ' f`)).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &apos; f',
    )
  })

  it('escapes the ampersand first, so nothing is double-escaped', () => {
    /*
     * The classic ordering bug: escaping `<` before `&` turns `<` into `&lt;`
     * and then that `&` into `&amp;lt;`, and the reader shows the markup.
     */
    expect(xmlEscape('<')).toBe('&lt;')
    expect(xmlEscape('&lt;')).toBe('&amp;lt;')
  })

  it('strips the control characters XML cannot carry', () => {
    /*
     * XML 1.0 has no representation for most control characters — not an
     * escape, not a literal. A post carrying one from an import or a paste out
     * of a binary file would otherwise produce a feed every reader rejects,
     * from content the board itself displays without complaint.
     */
    expect(xmlEscape('a\u0000b\u0007c\u001Fd\u007Fe')).toBe('abcde')
  })

  it('keeps the whitespace XML does allow', () => {
    /*
     * Tab, newline and carriage return are legal and meaningful. Stripping them
     * with the rest would run a multi-paragraph post into one line — the fix
     * for a rare parse error breaking every ordinary post.
     */
    expect(xmlEscape('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })
})

describe('summarise', () => {
  it('strips BBCode, including tags with arguments', () => {
    expect(summarise('[b]Hi[/b] see [url=https://x.test]this[/url]')).toBe('Hi see this')
  })

  it('collapses whitespace so a feed entry is one paragraph', () => {
    expect(summarise('one\n\n   two')).toBe('one two')
  })

  it('truncates on a word boundary', () => {
    const source = `${'word '.repeat(80)}end`
    const out = summarise(source, 50)

    expect(out.length).toBeLessThanOrEqual(51)
    expect(out.endsWith('…')).toBe(true)
    /* Cut between words, not through one. */
    expect(out.slice(0, -1).endsWith('word')).toBe(true)
  })

  it('cuts through a long token rather than truncating to almost nothing', () => {
    /*
     * "See: <a 400-character URL>" — the last space inside the budget is at
     * character four. Breaking there yields "See" and throws away the whole
     * summary, so the word boundary is used only when it is late enough to be
     * worth having. Kills the mutant that always breaks on the last space.
     */
    const out = summarise(`See: https://example.test/${'a'.repeat(400)}`, 50)

    expect(out.length).toBeGreaterThan(40)
    expect(out.startsWith('See: https')).toBe(true)
  })

  it('answers empty for a post that is gone', () => {
    expect(summarise(null)).toBe('')
  })
})

describe('renderRss', () => {
  it('escapes a title that would otherwise break the document', () => {
    const xml = renderRss(channel([entry({ title: 'Tom & Jerry <script>' })]))

    expect(xml).toContain('<title>Tom &amp; Jerry &lt;script&gt;</title>')
    expect(xml).not.toContain('<script>')
  })

  it('marks the guid as not a permalink', () => {
    /*
     * A reader keys "have I seen this" on the id, so it must survive a rename —
     * which changes a thread's slug and therefore its URL. Declaring the id a
     * permalink invites the reader to fetch it, and using the URL as the id
     * re-notifies everybody every time a title is corrected.
     */
    expect(renderRss(channel([entry()]))).toContain('<guid isPermaLink="false">')
  })

  it('dates items in RFC 822, which is what RSS requires', () => {
    expect(renderRss(channel([entry()]))).toContain('<pubDate>Tue, 05 May 2026 12:00:00 GMT')
  })

  it('renders an empty channel rather than failing', () => {
    /* A board with no public threads still has a feed; it just has no items. */
    const xml = renderRss(channel([]))
    expect(xml).toContain('<channel>')
    expect(xml).not.toContain('<item>')
  })
})

describe('renderAtom', () => {
  it('dates entries in ISO 8601, which is what Atom requires', () => {
    /*
     * The two formats are not interchangeable, and a feed carrying the wrong
     * one parses as a feed with no dates — entries in arbitrary order, forever.
     * Kills the mutant that shares one date helper between the two.
     */
    const xml = renderAtom(channel([entry()]))

    expect(xml).toContain('<published>2026-05-05T12:00:00.000Z</published>')
    expect(xml).not.toContain('GMT')
  })

  it('escapes an attribute as well as an element', () => {
    const xml = renderAtom(channel([entry({ href: 'https://example.test/?a=1&b=2' })]))

    expect(xml).toContain('href="https://example.test/?a=1&amp;b=2"')
  })
})

describe('renderSitemap', () => {
  it('omits lastmod rather than inventing one', () => {
    /*
     * `lastmod` is a promise about when the page changed. Defaulting it to now
     * teaches a crawler to keep re-fetching a page that never moves, which is a
     * cost paid forever for a field that could simply be absent.
     */
    const xml = renderSitemap([{ loc: 'https://example.test/forum/1-open' }])

    expect(xml).not.toContain('<lastmod>')
    expect(xml).toContain('<loc>https://example.test/forum/1-open</loc>')
  })

  it('includes lastmod when there is one', () => {
    const xml = renderSitemap([{ loc: 'https://example.test/thread/1-a', lastmod: AT }])
    expect(xml).toContain('<lastmod>2026-05-05T12:00:00.000Z</lastmod>')
  })

  it('escapes a URL containing an ampersand', () => {
    const xml = renderSitemap([{ loc: 'https://example.test/x?a=1&b=2' }])
    expect(xml).toContain('a=1&amp;b=2')
  })
})

describe('renderSitemapIndex', () => {
  it('uses sitemap elements, not url elements', () => {
    /*
     * An index and a sitemap are different documents with different element
     * names, and a crawler rejects one served as the other. Kills the mutant
     * that shares a renderer between them.
     */
    const xml = renderSitemapIndex([{ loc: 'https://example.test/sitemap/forums.xml' }])

    expect(xml).toContain('<sitemapindex')
    expect(xml).toContain('<sitemap>')
    expect(xml).not.toContain('<url>')
  })
})
