/**
 * F76 — canonical URLs, social cards and JSON-LD, as pure functions.
 *
 * ## The canonical points at the page you are on
 *
 * Not at page one. A thread's page 4 is a distinct document with distinct
 * content, and telling a crawler it is really page 1 asks it to drop three
 * quarters of the thread from its index — the single most common way a forum
 * ends up with only its first pages searchable. What the canonical *does* fix
 * is the surplus: a permalink (`?post=812`), a cursor (`?after=…`) and a
 * highlighted reveal (`?reveal=…`) are three URLs for one document, and only
 * the page number survives into the canonical.
 *
 * ## The card is built from what the page already resolved
 *
 * Every function here takes titles and text that the page has *already read
 * inside the viewer's scope*. Nothing fetches. That is what makes the leak
 * impossible rather than merely unlikely: a private thread's page throws before
 * a metadata builder is ever called, so there is no private title in scope for
 * one of these to describe.
 */
import { summarise } from '@meith/markdown'

export interface CanonicalInput {
  /** The route's own path, with no query string. */
  readonly path: string
  /** 1-based. Page 1 carries no parameter, so the canonical is the bare path. */
  readonly page: number
}

/**
 * The canonical URL for a paginated document.
 *
 * Page 1 is the bare path rather than `?page=1`: both work, one of them is what
 * every link on the board already points at, and a canonical that disagrees
 * with the site's own links is a canonical the crawler distrusts.
 */
export function canonicalPath(input: CanonicalInput): string {
  return input.page <= 1 ? input.path : `${input.path}?page=${input.page}`
}

export interface PageLinks {
  readonly canonical: string
  readonly previous: string | null
  readonly next: string | null
}

/**
 * `canonical`, `prev` and `next` for a paginated document.
 *
 * `prev`/`next` are advisory rather than load-bearing — the crawlers that used
 * them as a grouping signal stopped years ago — but they remain the only
 * machine-readable statement that these pages are a sequence, and they cost one
 * line each.
 */
export function pageLinks(input: CanonicalInput & { readonly hasNext: boolean }): PageLinks {
  return {
    canonical: canonicalPath(input),
    previous: input.page <= 1 ? null : canonicalPath({ path: input.path, page: input.page - 1 }),
    next: input.hasNext ? canonicalPath({ path: input.path, page: input.page + 1 }) : null,
  }
}

/**
 * A description for a card, out of the Markdown source.
 *
 * Shorter than the feed's summary because the platforms truncate around 200
 * characters and a description cut mid-word by somebody else's renderer reads
 * worse than one cut on a word here. The flattening is the renderer's own
 * (`@meith/markdown`), so a description can never claim something the post does
 * not say.
 */
export function cardDescription(source: string | null, fallback: string): string {
  if (source === null) return fallback
  const flat = summarise(source, 200)
  return flat === '' ? fallback : flat
}

export interface ThreadJsonLd {
  readonly title: string
  readonly url: string
  readonly author: string
  readonly published: Date
  readonly modified: Date
  readonly replyCount: number
  readonly forumTitle: string
  readonly description: string
}

/**
 * A JSON-LD record, safe to place inside a `<script>` element.
 *
 * `JSON.stringify` escapes quotes and backslashes and **does not escape the
 * forward slash**, so a thread titled `</script><script>alert(1)</script>`
 * serialises to exactly that text — the HTML parser ends the block at the
 * first `</script`, and the rest of the title becomes markup in the document.
 * Nothing about the JSON is malformed; the injection happens in the layer
 * underneath it.
 *
 * Escaping `<` as `\u003c` is valid JSON with the same value, and it is the
 * one transformation that closes this. Ampersand and the line separators go
 * with it: the first for HTML-entity contexts and the last two because U+2028
 * and U+2029 are literal newlines to a JavaScript parser but legal inside a
 * JSON string, which is the same bug wearing different characters.
 *
 * This is a function rather than a note in a comment because a note is
 * something the next page to add JSON-LD has to remember.
 */
export function jsonLdScript(record: Record<string, unknown>): string {
  return JSON.stringify(record)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * `DiscussionForumPosting`, which is the schema.org type for exactly this.
 *
 * Returns data. `jsonLdScript` above is the only supported way to get it into
 * a page, for a reason a test found rather than a review: `JSON.stringify`
 * alone is **not** enough.
 *
 * `interactionStatistic` rather than a bare `commentCount`: the former is what
 * the vocabulary specifies for a count of replies, and the latter is widely
 * copied and quietly ignored.
 */
export function threadJsonLd(input: ThreadJsonLd): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: input.title,
    url: input.url,
    datePublished: input.published.toISOString(),
    dateModified: input.modified.toISOString(),
    author: { '@type': 'Person', name: input.author },
    articleSection: input.forumTitle,
    description: input.description,
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/CommentAction',
      userInteractionCount: input.replyCount,
    },
  }
}
