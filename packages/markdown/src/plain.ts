/**
 * A body as the words in it, with none of the marks.
 *
 * Feeds, card descriptions, notification excerpts and search snippets all want
 * the same thing: what somebody wrote, without syntax and without HTML. Under
 * BBCode the codebase did this with a regular expression per call site — strip
 * `\[/?[a-z*][^\]]*\]` and hope — which was survivable because BBCode's syntax
 * is one shape. Markdown's is a dozen, and a regex that strips `*` also strips
 * the asterisks out of somebody's aside about multiplication.
 *
 * So this runs the real parser and walks the tree. It is the same parse the
 * renderer does, bounded by the same limits, and it cannot disagree with what
 * the post actually says — which is the property the regex never had.
 */
import { parse, type ParseOptions } from './blocks'
import type { Block, Inline } from './nodes'

function fromInline(nodes: readonly Inline[]): string {
  let out = ''
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
      case 'code':
        out += node.value
        break
      case 'image':
        /* The alt text, which is the only part of an image that is words. */
        out += node.alt
        break
      case 'break':
        out += ' '
        break
      case 'mention':
        /* The `@` too: "@wren agreed" without it reads as somebody else's words. */
        out += `@${node.name}`
        break
      default:
        out += fromInline(node.children)
    }
  }
  return out
}

function fromBlocks(blocks: readonly Block[]): string[] {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph':
      case 'heading':
        parts.push(fromInline(block.inline))
        break
      case 'code':
        parts.push(block.value)
        break
      case 'quote':
      case 'directive':
        parts.push(...fromBlocks(block.children))
        break
      case 'list':
        for (const item of block.items) parts.push(...fromBlocks(item.children))
        break
      case 'table':
        parts.push(block.head.map((cell) => fromInline(cell.inline)).join(' '))
        for (const row of block.rows) parts.push(row.map((cell) => fromInline(cell.inline)).join(' '))
        break
      case 'rule':
        break
    }
  }
  return parts
}

/** The body's words, whitespace collapsed. Never throws. */
export function plainText(source: string, options: ParseOptions = {}): string {
  return fromBlocks(parse(source, options).blocks)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * `plainText`, cut to `limit` on a word boundary.
 *
 * The break falls back to a hard cut when the "word" is longer than half the
 * budget — a pasted URL with no spaces in it would otherwise truncate to
 * nothing at all.
 */
export function summarise(source: string | null, limit = 300): string {
  if (source === null) return ''
  const flat = plainText(source)
  if (flat.length <= limit) return flat

  const cut = flat.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut}…`
}
