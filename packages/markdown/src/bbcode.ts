import { escapeMarkdownText } from './escape-source'
import { quoteBlock } from './quote'

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
  readonly raw: string
  readonly children: Node[]
}

function findRawClose(source: string, name: string, from: number): number {
  const pattern = new RegExp(`\\[/${name}\\]`, 'ig')
  pattern.lastIndex = from
  const match = pattern.exec(source)
  return match === null ? -1 : match.index
}

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

function prefixLines(value: string, prefix: string): string {
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`.trimEnd())
    .join('\n')
}

function fence(value: string): string {
  let longest = 0
  for (const run of value.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}

function convertNodes(nodes: readonly Node[]): string {
  return nodes.map(convertNode).join('')
}

function convertNode(node: Node): string {
  if (node.kind === 'text') return escapeMarkdownText(node.value)

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

    case 'quote':
      return `\n\n${quoteBlock({ author: quoteAuthor(node.attribute), markdown: inner.trim() })}\n\n`

    case 'list': {
      const ordered = node.attribute !== null && node.attribute.trim() !== ''
      const items = node.children
        .filter((child): child is Extract<Node, { kind: 'element' }> => child.kind === 'element' && child.tag === '*')
        .map((child, position) => {
          const marker = ordered ? `${position + 1}. ` : '- '
          const body = convertNodes(child.children).trim()
          return prefixLines(body, ' '.repeat(marker.length)).replace(/^\s+/, marker)
        })
      return items.length === 0 ? inner : `\n\n${items.join('\n')}\n\n`
    }
    case '*':
      return `\n- ${inner.trim()}`

    default:
      return escapeMarkdownText(`[${node.tag}${node.attribute === null ? '' : `=${node.attribute}`}]`) + inner + escapeMarkdownText(`[/${node.tag}]`)
  }
}

function rawTextOf(nodes: readonly Node[]): string {
  let out = ''
  for (const node of nodes) {
    if (node.kind === 'text' || node.kind === 'raw') out += node.value
    else out += rawTextOf(node.children)
  }
  return out
}

export function bbcodeToMarkdown(source: string): string {
  const converted = convertNodes(parseBBCode(source.replace(/\r\n?/g, '\n')))
  return converted.replace(/\n{3,}/g, '\n\n').trim()
}
