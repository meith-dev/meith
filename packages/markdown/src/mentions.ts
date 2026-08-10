import { parse, type ParseOptions } from './blocks'
import type { Block, Inline } from './nodes'
import { textOf } from './nodes'

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
      case 'quote':
      case 'code':
      case 'rule':
        break
    }
  }
}

export function extractMentions(source: string, options: ParseOptions = {}): readonly string[] {
  const out = new Set<string>()
  mentionBlocks(parse(source, options).blocks, out)
  return [...out]
}

function attributionsIn(nodes: readonly Inline[], out: Set<string>): void {
  let atLineStart = true
  for (const node of nodes) {
    if (node.kind === 'strong' && atLineStart && node.children.length === 1) {
      const match = ATTRIBUTION.exec(textOf(node.children).trim())
      if (match !== null && node.children[0]!.kind === 'text') out.add(match[1]!)
    }
    atLineStart = node.kind === 'break'
  }
}

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
