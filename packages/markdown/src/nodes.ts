export type Alignment = 'left' | 'center' | 'right' | null

export type Inline =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'emphasis'; readonly children: readonly Inline[] }
  | { readonly kind: 'strong'; readonly children: readonly Inline[] }
  | { readonly kind: 'strike'; readonly children: readonly Inline[] }
  | {
      readonly kind: 'link'
      readonly href: string
      readonly title: string | null
      readonly children: readonly Inline[]
    }
  | { readonly kind: 'image'; readonly src: string; readonly alt: string }
  | { readonly kind: 'break' }
  | { readonly kind: 'directive'; readonly name: string; readonly children: readonly Inline[] }
  | { readonly kind: 'mention'; readonly name: string }

export interface TableCell {
  readonly inline: readonly Inline[]
}

export type Block =
  | { readonly kind: 'paragraph'; readonly inline: readonly Inline[] }
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly inline: readonly Inline[] }
  | { readonly kind: 'quote'; readonly children: readonly Block[] }
  | {
      readonly kind: 'list'
      readonly ordered: boolean
      readonly start: number
      readonly tight: boolean
      readonly items: readonly ListItem[]
    }
  | { readonly kind: 'code'; readonly language: string | null; readonly value: string }
  | { readonly kind: 'rule' }
  | {
      readonly kind: 'table'
      readonly head: readonly TableCell[]
      readonly align: readonly Alignment[]
      readonly rows: readonly (readonly TableCell[])[]
    }
  | { readonly kind: 'directive'; readonly name: string; readonly children: readonly Block[] }

export interface ListItem {
  readonly checked: boolean | null
  readonly children: readonly Block[]
}

export interface MarkdownDocument {
  readonly blocks: readonly Block[]
  readonly truncated: boolean
}

export function textOf(nodes: readonly Inline[]): string {
  let out = ''
  for (const node of nodes) {
    if (node.kind === 'text' || node.kind === 'code') out += node.value
    else if (node.kind === 'image') out += node.alt
    else if (node.kind === 'break') out += '\n'
    else if (node.kind === 'mention') out += `@${node.name}`
    else out += textOf(node.children)
  }
  return out
}
