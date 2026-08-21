import 'server-only'

import { env } from '@meith/core'
import { escapeAttribute, escapeHtml, safeImageUrl, safeUrl } from '@meith/markdown'

import { unescapeHtml } from './html-entities'

interface Provider {
  readonly name: string
  readonly match: (url: URL) => boolean
  readonly oembedUrl: (url: URL) => string
}

// Two providers, both with a stable, key-free, publicly documented oEmbed
// endpoint. The fetch this module makes always goes to one of these two
// hardcoded hosts — the member's own URL is only ever passed along as a
// query value, never as a fetch target — so there is no SSRF surface here
// to widen by adding a provider whose endpoint is not equally fixed.
const PROVIDERS: readonly Provider[] = [
  {
    name: 'YouTube',
    match: (url) =>
      ['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname) && url.pathname !== '/',
    oembedUrl: (url) =>
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.href)}`,
  },
  {
    name: 'Vimeo',
    match: (url) => ['www.vimeo.com', 'vimeo.com'].includes(url.hostname) && url.pathname !== '/',
    oembedUrl: (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url.href)}`,
  },
]

const MAX_EMBEDS_PER_POST = 3
const FETCH_TIMEOUT_MS = 2_000

interface OEmbedResponse {
  readonly title?: unknown
  readonly author_name?: unknown
  readonly thumbnail_url?: unknown
}

// A paragraph whose entire content is one plain link — packages/markdown's own
// rendering shape for a bare URL, or a `[label](url)` on its own line. A link
// that shares a paragraph with other prose is left alone: unfurling it would
// turn "see the trailer (https://…)" into a card the sentence never asked for.
const LONE_LINK =
  /<p><a href="([^"]*)" rel="nofollow ugc noopener noreferrer"(?: title="[^"]*")?>[^<]*<\/a><\/p>/g

async function fetchOEmbed(provider: Provider, url: URL): Promise<OEmbedResponse | null> {
  try {
    const response = await fetch(provider.oembedUrl(url), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) return null
    return (await response.json()) as OEmbedResponse
  } catch {
    // A slow, unreachable, or malformed provider response is never worth
    // failing — or even delaying — the post over. The link stays a link.
    return null
  }
}

function renderCard(provider: Provider, href: string, data: OEmbedResponse): string | null {
  const link = safeUrl(href)
  if (link === null) return null

  const title = typeof data.title === 'string' && data.title !== '' ? data.title : provider.name
  const author = typeof data.author_name === 'string' ? data.author_name : null
  const thumbnail = typeof data.thumbnail_url === 'string' ? safeImageUrl(data.thumbnail_url) : null

  const image =
    thumbnail === null
      ? ''
      : `<img src="${escapeAttribute(thumbnail)}" alt="" loading="lazy" class="md-embed-thumb">`
  const byline = author === null ? '' : `<span class="md-embed-author">${escapeHtml(author)}</span>`
  const linkAttr = escapeAttribute(link)

  return (
    `<figure class="md-embed" data-provider="${escapeAttribute(provider.name.toLowerCase())}">` +
    `<a href="${linkAttr}" rel="nofollow ugc noopener noreferrer">${image}</a>` +
    `<figcaption>` +
    `<a href="${linkAttr}" rel="nofollow ugc noopener noreferrer" class="md-embed-title">${escapeHtml(title)}</a>` +
    `${byline}<span class="md-embed-provider">${escapeHtml(provider.name)}</span>` +
    `</figcaption></figure>`
  )
}

/**
 * Static-card link unfurling for a post's own-line YouTube/Vimeo links, run
 * once at write time (see markdown-pipeline.ts) alongside code highlighting.
 * Gated on the same REMOTE_IMAGES flag the CSP's `img-src` already uses,
 * since a card's thumbnail is exactly the kind of remote image that flag
 * exists to allow or refuse — a board that has not opted into remote images
 * gets no cards, only the plain links it already had.
 */
export async function unfurlEmbeds(html: string): Promise<string> {
  if (!env.REMOTE_IMAGES || !html.includes('<a href=')) return html

  const matches = [...html.matchAll(LONE_LINK)].slice(0, MAX_EMBEDS_PER_POST)
  if (matches.length === 0) return html

  const replacements = new Map<string, string>()

  for (const match of matches) {
    const whole = match[0]
    if (replacements.has(whole)) continue

    const href = unescapeHtml(match[1] ?? '')
    let url: URL
    try {
      url = new URL(href)
    } catch {
      continue
    }
    if (url.protocol !== 'https:') continue

    const provider = PROVIDERS.find((candidate) => candidate.match(url))
    if (provider === undefined) continue

    const data = await fetchOEmbed(provider, url)
    if (data === null) continue

    const card = renderCard(provider, href, data)
    if (card === null) continue

    replacements.set(whole, `${whole}${card}`)
  }

  if (replacements.size === 0) return html
  return html.replace(LONE_LINK, (whole) => replacements.get(whole) ?? whole)
}
