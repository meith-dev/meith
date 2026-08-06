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
        out += node.alt
        break
      case 'break':
        out += ' '
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

export function plainText(source: string, options: ParseOptions = {}): string {
  return fromBlocks(parse(source, options).blocks)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function summarise(source: string | null, limit = 300): string {
  if (source === null) return ''
  const flat = plainText(source)
  if (flat.length <= limit) return flat

  const cut = flat.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut}…`
}
