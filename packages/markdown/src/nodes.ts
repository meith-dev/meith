/**
 * F36 — the parsed document.
 *
 * Two layers, because Markdown has two: a document is a list of **blocks**, and
 * the ones that hold prose hold a list of **inlines**. Keeping them apart in
 * the types is what stops the class of bug where a heading ends up containing a
 * list, or a code span is asked to hold a paragraph.
 *
 * The set is small and closed on purpose. The renderer's safety argument is
 * that every character it emits comes from a literal in `render.ts`, a value
 * that passed a validator, or a string that went through `escapeHtml` — and
 * that argument is only checkable by eye if there are few enough node kinds to
 * check. There is deliberately **no raw-HTML node**: Markdown's HTML blocks and
 * inline HTML are not parsed here, they are text (see `blocks.ts`).
 */

export type Alignment = 'left' | 'center' | 'right' | null

export type Inline =
  | { readonly kind: 'text'; readonly value: string }
  /** A code span. Verbatim; never scanned for other inline markup. */
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'emphasis'; readonly children: readonly Inline[] }
  | { readonly kind: 'strong'; readonly children: readonly Inline[] }
  | { readonly kind: 'strike'; readonly children: readonly Inline[] }
  | {
      readonly kind: 'link'
      /** Unvalidated source. `render.ts` is the only place it becomes an href. */
      readonly href: string
      readonly title: string | null
      readonly children: readonly Inline[]
    }
  | { readonly kind: 'image'; readonly src: string; readonly alt: string }
  /** A line break inside a paragraph. See `blocks.ts` on why every newline is one. */
  | { readonly kind: 'break' }
  /** `:name[text]` — a board-defined inline directive (F71). */
  | { readonly kind: 'directive'; readonly name: string; readonly children: readonly Inline[] }

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
      /** The first number of an ordered list. Always 1 for a bullet list. */
      readonly start: number
      /**
       * A tight list wraps its items' prose in nothing; a loose one wraps it in
       * `<p>`. CommonMark decides this per list, and so does this: one blank
       * line anywhere inside makes the whole list loose, which is what stops a
       * list from changing its spacing halfway down.
       */
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
  /** `:::name` … `:::` — a board-defined block directive (F71). */
  | { readonly kind: 'directive'; readonly name: string; readonly children: readonly Block[] }

export interface ListItem {
  /**
   * `null` for an ordinary item; a checkbox state for `- [ ]` / `- [x]`.
   *
   * Held on the item rather than smuggled into its first paragraph as text,
   * because the renderer emits a real `<input type="checkbox" disabled>` and
   * needs to know before it renders the prose beside it.
   */
  readonly checked: boolean | null
  readonly children: readonly Block[]
}

export interface MarkdownDocument {
  readonly blocks: readonly Block[]
  /**
   * True when a limit was reached and the tail of the body is plain text.
   *
   * The body is never *cut* — nothing a member typed disappears — so this says
   * "some of this stopped being formatted", not "some of this is missing".
   */
  readonly truncated: boolean
}

/** The concatenated source text of an inline subtree, unescaped. */
export function textOf(nodes: readonly Inline[]): string {
  let out = ''
  for (const node of nodes) {
    if (node.kind === 'text' || node.kind === 'code') out += node.value
    else if (node.kind === 'image') out += node.alt
    else if (node.kind === 'break') out += '\n'
    else out += textOf(node.children)
  }
  return out
}
