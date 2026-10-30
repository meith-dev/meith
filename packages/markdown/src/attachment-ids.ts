import { type ParseOptions, parse } from './blocks'
import type { Block, Inline } from './nodes'

export function extractAttachmentIds(
  source: string,
  options: ParseOptions = {},
): readonly number[] {
  const ids = new Set<number>()
  function inline(nodes: readonly Inline[]): void {
    for (const node of nodes) {
      if (node.kind === 'attachment') ids.add(node.id)
      else if ('children' in node) inline(node.children)
    }
  }
  function blocks(nodes: readonly Block[]): void {
    for (const node of nodes) {
      if ('inline' in node) inline(node.inline)
      else if ('children' in node) blocks(node.children)
      else if (node.kind === 'list') for (const item of node.items) blocks(item.children)
      else if (node.kind === 'table') {
        for (const cell of node.head) inline(cell.inline)
        for (const row of node.rows) for (const cell of row) inline(cell.inline)
      }
    }
  }
  blocks(parse(source, options).blocks)
  return [...ids]
}
