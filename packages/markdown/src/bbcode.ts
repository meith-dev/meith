/**
 * The one-way door out of BBCode.
 *
 * Meith wrote BBCode until this release and writes Markdown now. Every board
 * that has been running has posts, private messages, signatures, announcements
 * and drafts full of `[b]…[/b]`, and there are exactly two honest ways to deal
 * with them: keep a second renderer forever, or **convert the source**. This is
 * the second. There is no BBCode renderer left in the tree.
 *
 * ## What that costs, stated plainly
 *
 * `[u]`, `[color]` and `[size]` have no Markdown spelling and are not invented
 * one. Their **text survives** and their styling does not: `[color=red]stop`
 * becomes `stop`. Inventing a directive for each would mean shipping three tags
 * that only exist on this board, which is the thing Markdown was chosen to stop
 * doing. `docs/mybb-parity.md` records the loss where an operator will look for
 * it before promising anyone a like-for-like move.
 *
 * ## Why the plain text is escaped
 *
 * A BBCode post is not Markdown source, and pretending it is would reformat it.
 * `*` was an asterisk on the old board, `# 1 fan` was not a heading, and
 * `snake_case` was a variable name. Every character that Markdown would read as
 * syntax is escaped on the way through, so a converted post renders as the post
 * it was — and an author who opens the editor afterwards sees backslashes only
 * where one was genuinely needed.
 *
 * ## When it runs
 *
 * Twice, and both are idempotent-by-construction rather than by luck: the
 * importer (F85) converts what MyBB hands it, and the render backfill converts
 * a row the first time it touches it, rewriting the source and stamping the row
 * as Markdown so it is never converted again. Nothing converts on write.
 */

/** Tags whose body is verbatim: the scanner must not look for tags inside. */
const RAW_TAGS = new Set(['code', 'php'])

const TAG = /^\[(\/?)([a-z*][a-z0-9]{0,15})(?:=([^\]\n]{0,256}))?\]/i

type Node =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'raw'; readonly tag: string; readonly value: string }
  | {
      readonly kind: 'element'
      readonly tag: string
      readonly attribute: string | null
      readonly children: Node[]
    }

interface Frame {
  readonly tag: string
  readonly attribute: string | null
  /** The literal opening tag, kept for when it is never closed. */
  readonly raw: string
  readonly children: Node[]
}

/** Find `[/name]` from `from`, case-insensitively. Returns its start index. */
function findRawClose(source: string, name: string, from: number): number {
  const pattern = new RegExp(`\\[/${name}\\]`, 'ig')
  pattern.lastIndex = from
  const match = pattern.exec(source)
  return match === null ? -1 : match.index
}

/**
 * Source to a tree.
 *
 * The same two rules the old parser had, because they are what makes the
 * conversion lossless: an unbalanced close is text, and a tag left open at the
 * end is *demoted* — its opening tag becomes literal text and its children move
 * up to where they were written.
 */
function parseBBCode(source: string): Node[] {
  const root: Frame = { tag: '', attribute: null, raw: '', children: [] }
  const stack: Frame[] = [root]
  const current = (): Frame => stack[stack.length - 1]!

  let buffer = ''
  let index = 0

  const flush = (): void => {
    if (buffer === '') return
    current().children.push({ kind: 'text', value: buffer })
    buffer = ''
  }

  while (index < source.length) {
    const open = source.indexOf('[', index)
    if (open === -1) {
      buffer += source.slice(index)
      break
    }
    buffer += source.slice(index, open)

    const match = TAG.exec(source.slice(open))
    if (match === null) {
      buffer += '['
      index = open + 1
      continue
    }

    const closing = match[1] === '/'
    const name = match[2]!.toLowerCase()
    const attribute = match[3] ?? null
    const after = open + match[0].length

    if (!closing && RAW_TAGS.has(name)) {
      const close = findRawClose(source, name, after)
      if (close === -1) {
        buffer += match[0]
        index = after
        continue
      }
      flush()
      current().children.push({ kind: 'raw', tag: name, value: source.slice(after, close) })
      index = close + name.length + 3
      continue
    }

    if (closing) {
      let target = -1
      for (let depth = stack.length - 1; depth >= 1; depth -= 1) {
        if (stack[depth]!.tag === name) {
          target = depth
          break
        }
      }
      if (target === -1) {
        buffer += match[0]
        index = after
        continue
      }
      flush()
      while (stack.length > target) {
        const frame = stack.pop()!
        current().children.push({
          kind: 'element',
          tag: frame.tag,
          attribute: frame.attribute,
          children: frame.children,
        })
      }
      index = after
      continue
    }

    flush()
    /* `[*]` is self-closing: the previous item ends where the next one starts. */
    if (name === '*' && current().tag === '*') {
      const frame = stack.pop()!
      current().children.push({
        kind: 'element',
        tag: frame.tag,
        attribute: frame.attribute,
        children: frame.children,
      })
    }
    stack.push({ tag: name, attribute, raw: match[0], children: [] })
    index = after
  }

  flush()

  while (stack.length > 1) {
    const frame = stack.pop()!
    current().children.push({ kind: 'text', value: frame.raw }, ...frame.children)
  }

  return root.children
}

/** Every character Markdown would read as syntax, made literal. */
function escapeMarkdown(value: string): string {
  return value
    .replace(/([\\`*_[\]<>|~])/g, '\\$1')
    .split('\n')
    /*
     * Line-leading markers only matter at the start of a line, and escaping
     * them everywhere would litter a converted post with backslashes in front
     * of every hyphen anybody ever typed mid-sentence.
     */
    .map((line) => line.replace(/^(\s*)(:::|[#>+=-]|\d+[.)])/, '$1\\$2'))
    .join('\n')
}

/** The quoted author in `[quote='Bob' pid='42']`. The pid is dropped. */
function quoteAuthor(attribute: string | null): string | null {
  if (attribute === null) return null
  const trimmed = attribute.trim()
  if (trimmed === '') return null

  const quote = trimmed[0]
  if (quote === "'" || quote === '"') {
    const end = trimmed.indexOf(quote, 1)
    const author = end === -1 ? trimmed.slice(1) : trimmed.slice(1, end)
    return author.trim() === '' ? null : author.trim()
  }
  const author = trimmed.split(/\s+/)[0]!
  return author === '' ? null : author
}

/** Prefix every line, so a multi-paragraph quote stays one quote. */
function prefixLines(value: string, prefix: string): string {
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`.trimEnd())
    .join('\n')
}

/** A fence long enough that the body cannot close it. */
function fence(value: string): string {
  let longest = 0
  for (const run of value.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}

function convertNodes(nodes: readonly Node[]): string {
  return nodes.map(convertNode).join('')
}

function convertNode(node: Node): string {
  if (node.kind === 'text') return escapeMarkdown(node.value)

  if (node.kind === 'raw') {
    const body = node.value.replace(/^\r?\n/, '').replace(/\s+$/, '')
    const rail = fence(body)
    return `\n\n${rail}\n${body}\n${rail}\n\n`
  }

  const inner = convertNodes(node.children)

  switch (node.tag) {
    case 'b':
      return inner.trim() === '' ? inner : `**${inner}**`
    case 'i':
      return inner.trim() === '' ? inner : `*${inner}*`
    case 's':
      return inner.trim() === '' ? inner : `~~${inner}~~`
    /*
     * Underline, colour and size: the text, and nothing else. See this file's
     * header — Markdown has no spelling for any of the three, and a board-only
     * directive for each would be BBCode again under a different syntax.
     */
    case 'u':
    case 'color':
    case 'size':
      return inner

    case 'url': {
      const href = (node.attribute ?? rawTextOf(node.children)).trim()
      if (href === '') return inner
      if (node.attribute === null) return `<${href}>`
      return `[${inner}](${href})`
    }
    case 'email': {
      const address = (node.attribute ?? rawTextOf(node.children)).trim().replace(/^mailto:/i, '')
      if (address === '') return inner
      if (node.attribute === null) return `<${address}>`
      return `[${inner}](mailto:${address})`
    }
    case 'img': {
      const source = rawTextOf(node.children).trim()
      return source === '' ? inner : `![](${source})`
    }

    case 'quote': {
      const author = quoteAuthor(node.attribute)
      const heading = author === null ? '' : `**${escapeMarkdown(author)} wrote:**\n\n`
      return `\n\n${prefixLines(`${heading}${inner.trim()}`, '> ')}\n\n`
    }

    case 'list': {
      const ordered = node.attribute !== null && node.attribute.trim() !== ''
      const items = node.children
        .filter((child): child is Extract<Node, { kind: 'element' }> => child.kind === 'element' && child.tag === '*')
        .map((child, position) => {
          const marker = ordered ? `${position + 1}. ` : '- '
          const body = convertNodes(child.children).trim()
          /* Continuation lines line up under the marker, or they end the item. */
          return prefixLines(body, ' '.repeat(marker.length)).replace(/^\s+/, marker)
        })
      return items.length === 0 ? inner : `\n\n${items.join('\n')}\n\n`
    }
    /* A `[*]` outside a list. Its text, on its own line. */
    case '*':
      return `\n- ${inner.trim()}`

    default:
      /*
       * A tag this build never had — a custom one from the old board, or a typo.
       * Its source is kept, escaped, so nothing is lost and nothing formats.
       */
      return escapeMarkdown(`[${node.tag}${node.attribute === null ? '' : `=${node.attribute}`}]`) + inner + escapeMarkdown(`[/${node.tag}]`)
  }
}

/** A subtree's source text, unescaped. Only URL-shaped tags want this. */
function rawTextOf(nodes: readonly Node[]): string {
  let out = ''
  for (const node of nodes) {
    if (node.kind === 'text' || node.kind === 'raw') out += node.value
    else out += rawTextOf(node.children)
  }
  return out
}

/**
 * BBCode source to Markdown source.
 *
 * Total: there is no input this refuses, and none for which it throws. The
 * worst case is a post whose unrecognised tags render as the text they were.
 */
export function bbcodeToMarkdown(source: string): string {
  const converted = convertNodes(parseBBCode(source.replace(/\r\n?/g, '\n')))
  /*
   * Block conversions pad themselves with blank lines so that a quote after a
   * sentence is a quote rather than the fourth word of it. Collapsing the runs
   * afterwards is simpler than every branch knowing what came before it.
   */
  return converted.replace(/\n{3,}/g, '\n\n').trim()
}
