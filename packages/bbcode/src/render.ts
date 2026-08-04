/**
 * F36 — the tree to HTML.
 *
 * The output is *constructed*, never sanitised. Every character of it comes
 * from one of three places: a literal in this file or in `tags.ts`, a value
 * that passed a validator, or a string that went through `escapeHtml`. There
 * is no step that takes markup and tries to make it safe, because there is no
 * point at which attacker-controlled markup exists in the output to be cleaned.
 *
 * That is the whole of the security argument, and it is short on purpose.
 */
import { textOf, type BBDocument, type BBNode } from './ast'
import { escapeHtml } from './escape'
import { renderSmilies, type CompiledSmilies } from './extensions'
import { TAGS, type TagSpec } from './tags'

type Registry = Readonly<Record<string, TagSpec>>

function isBlock(node: BBNode | undefined, tags: Registry): boolean {
  if (node === undefined) return false
  if (node.kind === 'text') return false
  return tags[node.tag]?.block === true
}

/**
 * A text node, with the newlines a block element makes redundant removed.
 *
 * `[quote]…[/quote]\nnext line` should not open with a blank line: the
 * blockquote already ended the line. Exactly one newline is absorbed on each
 * side of a block, so a deliberate blank line after a quote survives — which is
 * the difference between tidying and eating the author's spacing.
 */
function renderText(
  value: string,
  previous: BBNode | undefined,
  next: BBNode | undefined,
  tags: Registry,
  smilies: CompiledSmilies | undefined,
): string {
  let text = value
  if (isBlock(previous, tags)) text = text.replace(/^\r?\n/, '')
  if (isBlock(next, tags)) text = text.replace(/\r?\n$/, '')
  return renderSmilies(text, smilies).replace(/\r?\n/g, '<br>\n')
}

export function renderNodes(
  nodes: readonly BBNode[],
  tags: Registry = TAGS,
  smilies?: CompiledSmilies,
): string {
  let html = ''
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!

    if (node.kind === 'text') {
      html += renderText(node.value, nodes[index - 1], nodes[index + 1], tags, smilies)
      continue
    }

    const spec = tags[node.tag]
    if (spec === undefined) {
      /*
       * Only reachable if a document is rendered against a smaller registry
       * than it was parsed with — F37's per-forum tag toggles will do exactly
       * that. Dropping the wrapper and keeping the contents is the answer that
       * loses no words.
       */
      html += node.kind === 'raw' ? escapeHtml(node.value) : renderNodes(node.children, tags, smilies)
      continue
    }

    html += spec.render(
      node.kind === 'raw'
        ? { attribute: node.attribute, html: escapeHtml(node.value), text: node.value, raw: node.value }
        : {
            attribute: node.attribute,
            html: renderNodes(node.children, tags, smilies),
            text: textOf(node.children),
            raw: '',
          },
    )
  }
  return html
}

export function renderDocument(
  document: BBDocument,
  tags: Registry = TAGS,
  smilies?: CompiledSmilies,
): string {
  return renderNodes(document.nodes, tags, smilies)
}
