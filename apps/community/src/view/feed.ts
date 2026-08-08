/**
 * F76 — RSS, Atom and sitemap XML, as pure functions.
 *
 * ## Why the serialisers are here and not in a route handler
 *
 * XML is the one output format on this board that React does not write, which
 * means it is the one format where escaping is the author's job. Doing it inline
 * in a route handler puts a hand-rolled `&` replacement next to a database read,
 * and the next feed copies it. Here it is one function, used by every emitter,
 * with tests that feed it the characters that break XML.
 *
 * ## What "escaping" has to cover
 *
 * A thread title is member-supplied text, and a feed is consumed by parsers far
 * stricter than a browser: a bare `&` is not a warning, it is a document that
 * fails to parse, and a `]]>` inside a CDATA section ends the section early —
 * which is why nothing here uses CDATA. Everything is escaped, including the
 * two quote forms, because the same function serialises attributes.
 *
 * Control characters are **stripped**, not escaped: XML 1.0 has no
 * representation for most of them, so a post containing one would otherwise
 * produce a feed no reader can parse, from content that renders perfectly on
 * the board.
 */

/** Entries in a board or community feed. */
export interface FeedEntry {
  readonly id: string
  readonly title: string
  readonly href: string
  readonly author: string
  readonly published: Date
  readonly updated: Date
  readonly summary: string
}

export interface FeedChannel {
  readonly title: string
  readonly description: string
  readonly href: string
  readonly selfHref: string
  readonly updated: Date
  readonly entries: readonly FeedEntry[]
}

/**
 * XML text escaping.
 *
 * All five predefined entities, and the quotes are included because attribute
 * values go through the same function — a serialiser with one escaper cannot
 * forget which context it is in.
 */
export function xmlEscape(value: string): string {
  return stripControl(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Drop the characters XML 1.0 cannot carry at all.
 *
 * Tab, newline and carriage return are the only control characters the spec
 * allows; the rest have no escape and no literal form. A post carrying a stray
 * NUL or form feed — an import artefact, a paste out of a binary file — would
 * otherwise produce a feed every reader rejects, from content the board itself
 * displays without complaint.
 */
function stripControl(value: string): string {
  // eslint-disable-next-line no-control-regex -- the point is the control range
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

/**
 * A summary, flattened out of the Markdown source.
 *
 * The **source**, not the rendered HTML, and that is a decision. Feed readers
 * sanitise inbound HTML with wildly different rules and several strip it
 * entirely; more to the point, the board's rendered HTML carries quote blocks,
 * directives and attachment markup whose meaning is lost outside the page. So
 * what a reader gets is the text somebody typed, truncated on a word boundary.
 *
 * Re-exported rather than reimplemented: `@meith/markdown` flattens a body by
 * running the real parser, which is the only way to be sure a summary says what
 * the post says.
 */
export { summarise } from '@meith/markdown'

/** RFC 822, which RSS 2.0 requires and `toUTCString` already produces. */
function rfc822(at: Date): string {
  return at.toUTCString()
}

export function renderRss(channel: FeedChannel): string {
  const items = channel.entries
    .map(
      (entry) => `    <item>
      <title>${xmlEscape(entry.title)}</title>
      <link>${xmlEscape(entry.href)}</link>
      <guid isPermaLink="false">${xmlEscape(entry.id)}</guid>
      <dc:creator>${xmlEscape(entry.author)}</dc:creator>
      <pubDate>${rfc822(entry.published)}</pubDate>
      <description>${xmlEscape(entry.summary)}</description>
    </item>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(channel.title)}</title>
    <link>${xmlEscape(channel.href)}</link>
    <description>${xmlEscape(channel.description)}</description>
    <lastBuildDate>${rfc822(channel.updated)}</lastBuildDate>
    <atom:link href="${xmlEscape(channel.selfHref)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

export function renderAtom(channel: FeedChannel): string {
  const entries = channel.entries
    .map(
      (entry) => `  <entry>
    <title>${xmlEscape(entry.title)}</title>
    <link rel="alternate" href="${xmlEscape(entry.href)}"/>
    <id>${xmlEscape(entry.id)}</id>
    <author><name>${xmlEscape(entry.author)}</name></author>
    <published>${entry.published.toISOString()}</published>
    <updated>${entry.updated.toISOString()}</updated>
    <summary type="text">${xmlEscape(entry.summary)}</summary>
  </entry>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xmlEscape(channel.title)}</title>
  <link rel="alternate" href="${xmlEscape(channel.href)}"/>
  <link rel="self" href="${xmlEscape(channel.selfHref)}"/>
  <id>${xmlEscape(channel.href)}</id>
  <updated>${channel.updated.toISOString()}</updated>
${entries}
</feed>
`
}

export interface SitemapUrl {
  readonly loc: string
  readonly lastmod?: Date | undefined
}

export function renderSitemap(urls: readonly SitemapUrl[]): string {
  const entries = urls
    .map((url) => {
      /*
       * `lastmod` is omitted rather than defaulted. A crawler treats it as a
       * promise about when the page changed, and inventing "now" for a community
       * nobody has posted in teaches it to re-fetch a page that never moves.
       */
      const lastmod =
        url.lastmod === undefined ? '' : `\n    <lastmod>${url.lastmod.toISOString()}</lastmod>`
      return `  <url>\n    <loc>${xmlEscape(url.loc)}</loc>${lastmod}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.w3.org/schemas/sitemap/0.9">
${entries}
</urlset>
`
}

export function renderSitemapIndex(sitemaps: readonly SitemapUrl[]): string {
  const entries = sitemaps
    .map((url) => {
      const lastmod =
        url.lastmod === undefined ? '' : `\n    <lastmod>${url.lastmod.toISOString()}</lastmod>`
      return `  <sitemap>\n    <loc>${xmlEscape(url.loc)}</loc>${lastmod}\n  </sitemap>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.w3.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`
}
