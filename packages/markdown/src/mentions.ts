/**
 * Who a post speaks to: its mentions, and the authors it quotes.
 *
 * Both readers run the real parser and walk the tree, for the reason `plain.ts`
 * gives: a regex over source cannot know it is inside a code fence, and the one
 * property a notification producer needs is that it agrees with what the
 * rendered page shows. A member is told they were mentioned exactly when the
 * post renders their name as a mention — never because `@name` appeared inside
 * a code sample about email addresses.
 *
 * Names come back **as typed**, not folded: case-folding an identifier is
 * `@meith/accounts`' rule (`foldIdentifier`, and the locale argument in its
 * header), and this package must not grow a second copy of it. Deduplication
 * here is therefore best-effort by exact spelling; the caller folding for
 * lookup is what actually collapses `@Wren` and `@wren`.
 */
import { parse, type ParseOptions } from './blocks'
import type { Block, Inline } from './nodes'
import { textOf } from './nodes'

/** `> **name wrote:**` — what `quoteBlock` writes, read back off the tree. */
const ATTRIBUTION = /^(.+) wrote:$/

function mentionsIn(nodes: readonly Inline[], out: Set<string>): void {
  for (const node of nodes) {
    if (node.kind === 'mention') out.add(node.name)
    else if ('children' in node) mentionsIn(node.children, out)
  }
}

function mentionBlocks(blocks: readonly Block[], out: Set<string>): void {
  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph':
      case 'heading':
        mentionsIn(block.inline, out)
        break
      case 'list':
        for (const item of block.items) mentionBlocks(item.children, out)
        break
      case 'table':
        for (const cell of block.head) mentionsIn(cell.inline, out)
        for (const row of block.rows) for (const cell of row) mentionsIn(cell.inline, out)
        break
      case 'directive':
        mentionBlocks(block.children, out)
        break
      /*
       * Quotes are deliberately skipped. The `@name` inside a quoted passage is
       * the *quoted* author's mention, already delivered when their post was
       * made — replaying it would notify somebody twice for every reply that
       * quotes the conversation they are in.
       */
      case 'quote':
      case 'code':
      case 'rule':
        break
    }
  }
}

/**
 * Every name this body mentions, in first-appearance order.
 *
 * Parsed with the same options the render uses, so a construct that is off for
 * this body — mentions themselves included — extracts nothing the page does not
 * show.
 */
export function extractMentions(source: string, options: ParseOptions = {}): readonly string[] {
  const out = new Set<string>()
  mentionBlocks(parse(source, options).blocks, out)
  return [...out]
}

/**
 * The attribution names a paragraph carries: each `strong` that opens the
 * paragraph or follows a line break and reads `… wrote:`. Scanning past the
 * first one matters because multiquote stacks quotes back to back, and two
 * stacked quotes whose blank line was edited away are one paragraph with two
 * attributions in it.
 */
function attributionsIn(nodes: readonly Inline[], out: Set<string>): void {
  let atLineStart = true
  for (const node of nodes) {
    if (node.kind === 'strong' && atLineStart) {
      const match = ATTRIBUTION.exec(textOf(node.children).trim())
      if (match !== null) out.add(match[1]!)
    }
    atLineStart = node.kind === 'break'
  }
}

/**
 * The authors this body quotes, in first-appearance order.
 *
 * Read from the tree rather than carried through the composer, because the
 * attribution line *is* the quoting mechanism: `quoteBlock` writes it, the
 * reply form prefills it, and a member who assembles the same shape by hand has
 * quoted somebody just as surely. Only **top-level** quote blocks count — a
 * quote inside a quote is the conversation the quoted post already had, and its
 * author was told when it happened.
 */
export function extractQuotedAuthors(
  source: string,
  options: ParseOptions = {},
): readonly string[] {
  const out = new Set<string>()
  for (const block of parse(source, options).blocks) {
    if (block.kind !== 'quote') continue
    for (const child of block.children) {
      if (child.kind === 'paragraph') attributionsIn(child.inline, out)
    }
  }
  return [...out]
}
