/**
 * F36 — tokens to a tree.
 *
 * Two rules decide everything this file does, and they are the two places a
 * BBCode parser usually goes wrong:
 *
 *  1. **Never emit unbalanced output.** `[b][i]x[/b]` closes `[i]` implicitly,
 *     the way an HTML parser would, so the renderer cannot produce a `<strong>`
 *     that escapes its post and bolds the rest of the page.
 *  2. **Never let an unclosed tag swallow the thread.** A tag still open at the
 *     end of the body is *demoted*: its opening tag becomes literal text and
 *     its children move up to where they were written. Somebody who types
 *     `[b]` and forgets the close sees `[b]` — not a post where every word
 *     after it is bold, and not an error page.
 *
 * Both rules are lossless. Nothing a member typed is ever dropped: the worst
 * outcome anywhere in this file is that some of it renders as the text it is.
 */
import type { BBDocument, BBNode } from './ast'
import { DEFAULT_LIMITS, type BBCodeLimits } from './limits'
import { RAW_TAGS, TAGS, type TagSpec } from './tags'
import { tokenise } from './tokenise'

interface Frame {
  readonly tag: string
  readonly attribute: string | null
  /** The literal opening tag, kept for demotion. */
  readonly raw: string
  readonly children: BBNode[]
}

export interface ParseOptions {
  readonly limits?: Partial<BBCodeLimits>
  /** Override the tag set. F37's custom tags arrive through here. */
  readonly tags?: Readonly<Record<string, TagSpec>>
}

/**
 * Content directly inside `[list]` that is not an item.
 *
 * `[*]` is self-closing, so it absorbs everything up to the next item or the
 * list's close — which means stray content can only occur *before* the first
 * item. Whitespace there is what people actually type (`[list]\n[*]one`) and is
 * dropped; anything else is given its own item rather than emitted as a bare
 * text child of a `<ul>`, which is invalid HTML and renders unpredictably.
 */
function normaliseList(children: readonly BBNode[]): BBNode[] {
  const firstItem = children.findIndex(
    (node) => node.kind === 'element' && node.tag === '*',
  )
  const splitAt = firstItem === -1 ? children.length : firstItem
  const lead = children.slice(0, splitAt)
  const rest = children.slice(splitAt)

  const meaningful = lead.some(
    (node) => node.kind !== 'text' || node.value.trim().length > 0,
  )
  if (!meaningful) return [...rest]
  return [{ kind: 'element', tag: '*', attribute: null, children: lead }, ...rest]
}

export function parse(source: string, options: ParseOptions = {}): BBDocument {
  const limits: BBCodeLimits = { ...DEFAULT_LIMITS, ...options.limits }
  const tags = options.tags ?? TAGS
  const rawTags =
    options.tags === undefined
      ? RAW_TAGS
      : new Set(
          Object.entries(options.tags)
            .filter(([, spec]) => spec.raw)
            .map(([name]) => name),
        )

  const tokens = tokenise(source, { rawTags, maxInput: limits.maxInput })

  const root: Frame = { tag: '', attribute: null, raw: '', children: [] }
  const stack: Frame[] = [root]
  let nodes = 0
  let truncated = source.length > limits.maxInput

  const current = (): Frame => stack[stack.length - 1]!

  /** Append text, merging into a trailing text node so runs stay one node. */
  const pushText = (value: string): void => {
    if (value.length === 0) return
    const children = current().children
    const last = children[children.length - 1]
    if (last !== undefined && last.kind === 'text') {
      children[children.length - 1] = { kind: 'text', value: last.value + value }
      return
    }
    children.push({ kind: 'text', value })
    nodes += 1
  }

  /** Pop the top frame into its parent as a finished element. */
  const closeFrame = (): void => {
    const frame = stack.pop()!
    const children = frame.tag === 'list' ? normaliseList(frame.children) : frame.children
    current().children.push({
      kind: 'element',
      tag: frame.tag,
      attribute: frame.attribute,
      children,
    })
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!

    if (nodes >= limits.maxNodes) {
      /*
       * Out of budget. The rest of the body is appended verbatim as text rather
       * than discarded: a post that hits this limit is pathological, but it is
       * still somebody's post, and losing its second half silently would be a
       * data-loss bug reported as "my long post is cut off".
       */
      truncated = true
      let tail = ''
      for (let rest = index; rest < tokens.length; rest += 1) tail += tokens[rest]!.raw
      pushText(tail)
      break
    }

    if (token.kind === 'text') {
      pushText(token.value)
      continue
    }

    if (token.kind === 'raw') {
      current().children.push({
        kind: 'raw',
        tag: token.name,
        attribute: token.attribute,
        value: token.value,
      })
      nodes += 1
      continue
    }

    const spec = tags[token.name]
    if (spec === undefined) {
      pushText(token.raw)
      continue
    }

    if (token.kind === 'open') {
      /* `[*]` after `[*]`: the previous item ends where the next one starts. */
      if (spec.selfClosing && current().tag === token.name) closeFrame()

      if (spec.parents !== null && !spec.parents.includes(current().tag)) {
        pushText(token.raw)
        continue
      }
      if (stack.length - 1 >= limits.maxDepth) {
        pushText(token.raw)
        continue
      }

      stack.push({
        tag: token.name,
        attribute: token.attribute,
        raw: token.raw,
        children: [],
      })
      nodes += 1
      continue
    }

    // A closing tag. Find its opening one, innermost first.
    let target = -1
    for (let depth = stack.length - 1; depth >= 1; depth -= 1) {
      if (stack[depth]!.tag === token.name) {
        target = depth
        break
      }
    }
    if (target === -1) {
      pushText(token.raw)
      continue
    }
    while (stack.length > target) closeFrame()
  }

  /*
   * Demote whatever is still open. Innermost first, so an unclosed `[b]`
   * containing a properly closed `[i]` keeps the italics and loses only the
   * bold.
   */
  while (stack.length > 1) {
    const frame = stack.pop()!
    current().children.push({ kind: 'text', value: frame.raw }, ...frame.children)
  }

  return { nodes: root.children, truncated }
}
