/**
 * Building a quote block.
 *
 * Four call sites used to assemble `> **name wrote:**` by hand — the reply
 * page's prefill, the private-message reply draft, the multiquote button and
 * the BBCode converter — and each had its own idea about the blank line. That
 * blank line is not cosmetic: **a blockquote ends at the first line without a
 * `>`**, so a quote of a two-paragraph post assembled without it puts the
 * second paragraph in the replier's own voice, over their own name. It is
 * decided once, here.
 *
 * ## What quoting does *not* do, and why
 *
 * There is no function here that turns rendered HTML back into Markdown, and
 * the absence is the design. A reader quoting a post is looking at markup this
 * package produced, so it is tempting to walk the selection and write source
 * back out — and that walker would be a **second implementation of the mapping
 * between source and output**, with weaker rules than the first, drifting
 * quietly every time a construct is added to `render.ts` and not to it. The
 * symptom is a quote that keeps its words and silently loses its links.
 *
 * The board already knows the answer without guessing: a post has an **id**,
 * the id resolves to the source it was rendered from, and that lookup re-checks
 * who may see it. So quoting asks the server for the post rather than reading
 * the page — which is also the only version that cannot be talked into quoting
 * something the reader was never shown.
 */
import { plainAuthorName } from './escape-source'

/** Whatever a caller quotes, and what it is attributed to. */
export interface QuoteInput {
  /** `null` or absent quotes the passage without naming anybody. */
  readonly author?: string | null
  /** Markdown source. Already source — this does not escape it. */
  readonly markdown: string
}

/**
 * A quote block, ready to be dropped into a composer.
 *
 * No trailing blank line: a caller decides what follows a quote, and the two
 * that matter disagree — a prefill wants the caret on a fresh paragraph
 * underneath, and multiquote wants the next quote.
 */
export function quoteBlock(input: QuoteInput): string {
  const author = input.author == null ? '' : plainAuthorName(input.author)
  const body = input.markdown.replace(/\r\n?/g, '\n').replace(/\s+$/, '')

  /* Every line marked, blank ones included. See this file's header for why. */
  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n')

  if (author === '') return quoted
  return `> **${author} wrote:**\n>\n${quoted}`
}
