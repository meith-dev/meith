/**
 * F36 — the parsed document.
 *
 * Three node kinds and nothing else. The AST is the contract between the parser
 * and the renderer, and keeping it this small is what makes the safety argument
 * short: a renderer that can only be handed text, an element, or a verbatim
 * block has no path by which source markup reaches the output untouched.
 */
export type BBNode =
  | { readonly kind: 'text'; readonly value: string }
  | {
      readonly kind: 'element'
      readonly tag: string
      readonly attribute: string | null
      readonly children: readonly BBNode[]
    }
  | {
      readonly kind: 'raw'
      readonly tag: string
      readonly attribute: string | null
      readonly value: string
    }

export interface BBDocument {
  readonly nodes: readonly BBNode[]
  /**
   * True when a limit was reached and the tail of the body is plain text.
   *
   * The body is never *cut* — nothing a member typed disappears — so this says
   * "some of this stopped being formatted", not "some of this is missing".
   */
  readonly truncated: boolean
}

/** The concatenated source text of a subtree, unescaped. `[url]` needs it. */
export function textOf(nodes: readonly BBNode[]): string {
  let out = ''
  for (const node of nodes) {
    if (node.kind === 'text') out += node.value
    else if (node.kind === 'raw') out += node.value
    else out += textOf(node.children)
  }
  return out
}
