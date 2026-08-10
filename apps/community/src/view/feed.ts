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

export function xmlEscape(value: string): string {
  return stripControl(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function stripControl(value: string): string {
  // eslint-disable-next-line no-control-regex -- the point is the control range
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

export { summarise } from '@meith/markdown'

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
