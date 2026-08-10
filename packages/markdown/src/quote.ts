import { memberByNameHref } from './attribution'
import { plainAuthorName } from './escape-source'

export interface QuoteInput {
  readonly author?: string | null
  /** Defaults to the author's profile; `null` leaves the name as plain text. */
  readonly authorHref?: string | null
  /** The post being quoted, written into the quote as a link back to it. */
  readonly sourceHref?: string | null
  readonly sourceLabel?: string
  readonly markdown: string
}

const DEFAULT_SOURCE_LABEL = 'View post'

function plainLabel(value: string): string {
  return value.replace(/[[\]()*`\\]/g, '').trim()
}

export function quoteBlock(input: QuoteInput): string {
  const author = input.author == null ? '' : plainAuthorName(input.author)
  const body = input.markdown.replace(/\r\n?/g, '\n').replace(/\s+$/, '')

  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n')

  if (author === '') return quoted

  return `> **${named(author, input)} wrote:**${source(input)}\n>\n${quoted}`
}

function named(author: string, input: QuoteInput): string {
  const href =
    input.authorHref === undefined ? memberByNameHref(input.author ?? author) : input.authorHref
  if (href === null || href.trim() === '') return author
  return `[${author}](${href.trim()})`
}

function source(input: QuoteInput): string {
  const href = input.sourceHref
  if (href == null || href.trim() === '') return ''

  const label = plainLabel(input.sourceLabel ?? DEFAULT_SOURCE_LABEL)
  return label === '' ? '' : ` [${label}](${href.trim()})`
}
