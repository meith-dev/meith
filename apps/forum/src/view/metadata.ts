import { summarise } from '@meith/markdown'

export interface CanonicalInput {
  readonly path: string
  readonly page: number
}

export function canonicalPath(input: CanonicalInput): string {
  return input.page <= 1 ? input.path : `${input.path}?page=${input.page}`
}

export interface PageLinks {
  readonly canonical: string
  readonly previous: string | null
  readonly next: string | null
}

export function pageLinks(input: CanonicalInput & { readonly hasNext: boolean }): PageLinks {
  return {
    canonical: canonicalPath(input),
    previous: input.page <= 1 ? null : canonicalPath({ path: input.path, page: input.page - 1 }),
    next: input.hasNext ? canonicalPath({ path: input.path, page: input.page + 1 }) : null,
  }
}

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

export function jsonLdScript(record: Record<string, unknown>): string {
  return JSON.stringify(record)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

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
