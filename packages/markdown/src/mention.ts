/**
 * Mentions and quote attributions, as facts about a body.
 *
 * Two questions a write path asks about the source it has just stored: **who
 * does this post address by name** (`@ada`), and **whose words does it
 * quote** (`> **ada wrote:**`). Both are answered by running the real parser
 * and walking the tree — the same argument `plain.ts` makes against a regex,
 * and it bites harder here because the answer decides who gets notified: a
 * pattern that matched an `@` inside a code span would notify somebody about
 * a shell script.
 *
 * Names come back as *typed*, not as accounts. Whether `ada` exists, whether
 * she may see the thread, whether she is the author talking to themselves —
 * all database and policy questions, and all the caller's. This package
 * reports what the text says and nothing else.
 */
import { parse, type ParseOptions } from './blocks'
import type { Block, Inline } from './nodes'
import { textOf } from './nodes'

/**
 * The href a mention renders as.
 *
 * By name, not by id, because rendering is pure and cached: resolving a name
 * to an id needs the database, and a stored render that embedded an id would
 * go stale the moment the account was renamed. The member-by-name route does
 * the lookup when somebody follows the link, at which point it is one indexed
 * read against `username_lower`.
 *
 * Exported so the app's route and this renderer cannot disagree about the
 * shape — the same one-place argument `quoteBlock` makes about its blank line.
 */
export function mentionHref(name: string): string {
  return `/member/by-name/${encodeURIComponent(name)}`
}

/** What `quoteBlock` writes above a quoted passage, read back. */
const ATTRIBUTION = /^(.+) wrote:$/

/**
 * Case-insensitive, order-preserving name collection.
 *
 * Folded with the same locale-independent lowercase `foldIdentifier` uses,
 * restated here because this package depends on nothing — and the fold must
 * agree with `username_lower` or `@Ada` and `@ada` would notify twice.
 */
function collect(seen: Map<string, string>, name: string): void {
  const trimmed = name.trim()
  if (trimmed === '') return
  const folded = trimmed.toLowerCase()
  if (!seen.has(folded)) seen.set(folded, trimmed)
}

function mentionsFromInline(nodes: readonly Inline[], seen: Map<string, string>): void {
  for (const node of nodes) {
    if (node.kind === 'mention') collect(seen, node.name)
    else if ('children' in node) mentionsFromInline(node.children, seen)
  }
}

function mentionsFromBlocks(blocks: readonly Block[], seen: Map<string, string>): void {
  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph':
      case 'heading':
        mentionsFromInline(block.inline, seen)
        break
      case 'quote':
        /*
         * Skipped whole, and this is the point of walking the tree: an `@ada`
         * inside a quote is the *quoted author's* words, already notified
         * about when they were first posted. Re-notifying on every quote of
         * them would make one mention ring forever.
         */
        break
      case 'directive':
        mentionsFromBlocks(block.children, seen)
        break
      case 'list':
        for (const item of block.items) mentionsFromBlocks(item.children, seen)
        break
      case 'table':
        for (const cell of block.head) mentionsFromInline(cell.inline, seen)
        for (const row of block.rows) for (const cell of row) mentionsFromInline(cell.inline, seen)
        break
      case 'code':
      case 'rule':
        break
    }
  }
}

/**
 * The usernames this body mentions in its own voice, as typed, deduplicated
 * case-insensitively, in order of first appearance.
 */
export function extractMentions(source: string, options: ParseOptions = {}): readonly string[] {
  const seen = new Map<string, string>()
  mentionsFromBlocks(parse(source, options).blocks, seen)
  return [...seen.values()]
}

/**
 * The authors this body quotes, read from top-level attribution lines.
 *
 * Top-level only, deliberately: a quote of a post that itself quoted somebody
 * parses as a quote *inside* a quote, and the inner author is one conversation
 * removed — they were told when the middle post quoted them. Only the person
 * whose words this post actually lifted is named.
 *
 * The attribution is the one `quoteBlock` writes: a first paragraph that is
 * exactly `**name wrote:**`. A hand-typed quote without one attributes
 * nobody, which is honest — there is nobody to tell.
 */
export function extractQuotedAuthors(source: string, options: ParseOptions = {}): readonly string[] {
  const seen = new Map<string, string>()

  for (const block of parse(source, options).blocks) {
    if (block.kind !== 'quote') continue
    const first = block.children[0]
    if (first === undefined || first.kind !== 'paragraph') continue
    if (first.inline.length !== 1) continue
    const only = first.inline[0]!
    if (only.kind !== 'strong') continue

    const match = ATTRIBUTION.exec(textOf(only.children))
    if (match !== null) collect(seen, match[1]!)
  }

  return [...seen.values()]
}
