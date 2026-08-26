import type { Block, Inline } from './nodes'
import { textOf } from './nodes'

const ATTRIBUTION = /^(.+) wrote:$/

export function memberByNameHref(name: string): string {
  const encoded = encodeURIComponent(name.trim()).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `/member/by-name/${encoded}`
}

export interface AttributedAuthor {
  readonly name: string
  readonly href: string | null
}

export function attributedAuthor(node: Inline): AttributedAuthor | null {
  if (node.kind !== 'strong') return null

  const match = ATTRIBUTION.exec(textOf(node.children).trim())
  if (match === null) return null

  const [first, second, ...rest] = node.children
  if (first === undefined || rest.length > 0) return null

  if (second === undefined) {
    return first.kind === 'text' ? { name: match[1]!, href: null } : null
  }

  if (first.kind !== 'link' || second.kind !== 'text') return null
  if (second.value.trim() !== 'wrote:') return null

  const name = textOf(first.children).trim()
  return name === '' ? null : { name, href: first.href }
}

export interface QuoteAttribution extends AttributedAuthor {
  readonly sourceHref: string | null
  readonly sourceLabel: string
}

export function quoteAttribution(block: Block | undefined): QuoteAttribution | null {
  if (block === undefined || block.kind !== 'paragraph') return null

  const [head, ...rest] = block.inline
  if (head === undefined) return null

  const author = attributedAuthor(head)
  if (author === null) return null

  let source: { readonly href: string; readonly label: string } | null = null
  for (const node of rest) {
    if (node.kind === 'text') {
      if (node.value.trim() !== '') return null
      continue
    }
    if (node.kind !== 'link' || source !== null) return null

    const label = textOf(node.children).trim()
    if (label === '') return null
    source = { href: node.href, label }
  }

  return {
    name: author.name,
    href: author.href,
    sourceHref: source?.href ?? null,
    sourceLabel: source?.label ?? '',
  }
}
