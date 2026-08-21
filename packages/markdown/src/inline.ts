import type { NodeBudget } from './budget'
import type { MarkdownFeatures } from './features'
import type { MarkdownLimits } from './limits'
import type { Inline } from './nodes'
import { textOf } from './nodes'

export interface InlineContext {
  readonly features: MarkdownFeatures
  readonly limits: MarkdownLimits
  readonly directives: ReadonlySet<string>
  readonly budget: NodeBudget
}

const PUNCTUATION = /[!-#%-*,-/:;?@[-\]_{}\p{P}\p{S}]/u

const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/

const DIRECTIVE_NAME = /^[a-z][a-z0-9]{0,15}$/

const BARE_URL = /^(https?:\/\/|www\.)[^\s<]*/i

const AUTOLINK = /^<([a-z][a-z0-9+.-]{1,31}:[^\s<>]*)>/i
const AUTOLINK_EMAIL = /^<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/

const MENTION = /^@([\p{L}\p{N}][\p{L}\p{N}._-]*)/u

const MENTION_QUOTED = /^@"([^"\n]+)"/

const MENTION_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u

const MENTION_MAX = 64

const ATTACHMENT = /^\[attachment=(\d{1,10})\]/

type Delimiter = {
  readonly t: 'delim'
  readonly char: string
  length: number
  readonly canOpen: boolean
  readonly canClose: boolean
  readonly raw: string
}

type Item = { readonly t: 'node'; readonly node: Inline } | Delimiter

function isWhitespace(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character)
}

function isPunctuation(character: string | undefined): boolean {
  return character !== undefined && PUNCTUATION.test(character)
}

function flanking(
  source: string,
  start: number,
  end: number,
  char: string,
): { canOpen: boolean; canClose: boolean } {
  const before = start === 0 ? undefined : source[start - 1]
  const after = end >= source.length ? undefined : source[end]

  const leftFlanking =
    !isWhitespace(after) && (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before))
  const rightFlanking =
    !isWhitespace(before) && (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after))

  if (char === '_') {
    return {
      canOpen: leftFlanking && (!rightFlanking || isPunctuation(before)),
      canClose: rightFlanking && (!leftFlanking || isPunctuation(after)),
    }
  }
  return { canOpen: leftFlanking, canClose: rightFlanking }
}

function matchingBracket(source: string, from: number): number {
  let depth = 0
  let index = from
  while (index < source.length) {
    const character = source[index]!
    if (character === '\\') {
      index += 2
      continue
    }
    if (character === '`') {
      const run = /^`+/.exec(source.slice(index))![0]
      const close = source.indexOf(run, index + run.length)
      index = close === -1 ? index + run.length : close + run.length
      continue
    }
    if (character === '[') depth += 1
    else if (character === ']') {
      depth -= 1
      if (depth === 0) return index
    }
    index += 1
  }
  return -1
}

interface Destination {
  readonly url: string
  readonly title: string | null
  readonly end: number
}

function readDestination(source: string, from: number): Destination | null {
  if (source[from] !== '(') return null
  let index = from + 1
  while (index < source.length && /\s/.test(source[index]!)) index += 1

  let url: string
  if (source[index] === '<') {
    const close = source.indexOf('>', index + 1)
    if (close === -1) return null
    url = source.slice(index + 1, close)
    if (url.includes('\n')) return null
    index = close + 1
  } else {
    let depth = 0
    const start = index
    while (index < source.length) {
      const character = source[index]!
      if (character === '\\' && index + 1 < source.length) {
        index += 2
        continue
      }
      if (/\s/.test(character)) break
      if (character === '(') depth += 1
      if (character === ')') {
        if (depth === 0) break
        depth -= 1
      }
      index += 1
    }
    url = unescapeBackslashes(source.slice(start, index))
  }

  while (index < source.length && /\s/.test(source[index]!)) index += 1

  let title: string | null = null
  const opener = source[index]
  if (opener === '"' || opener === "'" || opener === '(') {
    const closer = opener === '(' ? ')' : opener
    const close = source.indexOf(closer, index + 1)
    if (close === -1) return null
    title = unescapeBackslashes(source.slice(index + 1, close))
    index = close + 1
    while (index < source.length && /\s/.test(source[index]!)) index += 1
  }

  if (source[index] !== ')') return null
  return { url: url.trim(), title, end: index + 1 }
}

function unescapeBackslashes(value: string): string {
  return value.replace(/\\(.)/gs, (whole, character: string) =>
    ESCAPABLE.test(character) ? character : whole,
  )
}

function trimBareUrl(url: string): string {
  let end = url.length
  while (end > 0) {
    const character = url[end - 1]!
    if ('.,;:!?"\''.includes(character)) {
      end -= 1
      continue
    }
    if (character === ')' || character === ']') {
      const open = character === ')' ? '(' : '['
      const slice = url.slice(0, end)
      const opens = slice.split(open).length - 1
      const closes = slice.split(character).length - 1
      if (closes > opens) {
        end -= 1
        continue
      }
    }
    break
  }
  return url.slice(0, end)
}

export function parseInline(source: string, context: InlineContext, allowLinks = true): Inline[] {
  const items: Item[] = []
  let buffer = ''
  let index = 0
  let delimiters = 0

  const push = (node: Inline): boolean => {
    if (!context.budget.take()) return false
    items.push({ t: 'node', node })
    return true
  }

  const flush = (): void => {
    if (buffer.length === 0) return
    items.push({ t: 'node', node: { kind: 'text', value: buffer } })
    buffer = ''
  }

  while (index < source.length) {
    if (context.budget.spent) {
      context.budget.exhaust()
      buffer += source.slice(index)
      break
    }
    const character = source[index]!

    if (character === '\\') {
      const next = source[index + 1]
      if (next !== undefined && ESCAPABLE.test(next)) {
        buffer += next
        index += 2
        continue
      }
      buffer += character
      index += 1
      continue
    }

    if (character === '\n') {
      flush()
      if (!push({ kind: 'break' })) break
      index += 1
      while (index < source.length && (source[index] === ' ' || source[index] === '\t')) index += 1
      continue
    }

    if (character === '`' && context.features.codeSpans) {
      const run = /^`+/.exec(source.slice(index))![0]
      let search = index + run.length
      let close = -1
      while (search < source.length) {
        const at = source.indexOf(run, search)
        if (at === -1) break
        if (source[at + run.length] === '`') {
          search = at + /^`+/.exec(source.slice(at))![0].length
          continue
        }
        close = at
        break
      }
      if (close !== -1) {
        let value = source.slice(index + run.length, close).replace(/\n/g, ' ')
        if (
          value.length > 2 &&
          value.startsWith(' ') &&
          value.endsWith(' ') &&
          value.trim() !== ''
        ) {
          value = value.slice(1, -1)
        }
        flush()
        if (!push({ kind: 'code', value })) break
        index = close + run.length
        continue
      }
      buffer += run
      index += run.length
      continue
    }

    if (character === '<' && allowLinks && context.features.links) {
      const rest = source.slice(index)
      const scheme = AUTOLINK.exec(rest)
      const email = AUTOLINK_EMAIL.exec(rest)
      if (scheme !== null) {
        flush()
        if (
          !push({
            kind: 'link',
            href: scheme[1]!,
            title: null,
            children: [{ kind: 'text', value: scheme[1]! }],
          })
        )
          break
        index += scheme[0].length
        continue
      }
      if (email !== null) {
        flush()
        if (
          !push({
            kind: 'link',
            href: `mailto:${email[1]!}`,
            title: null,
            children: [{ kind: 'text', value: email[1]! }],
          })
        ) {
          break
        }
        index += email[0].length
        continue
      }
      buffer += character
      index += 1
      continue
    }

    if (character === '!' && source[index + 1] === '[') {
      const close = matchingBracket(source, index + 1)
      const destination = close === -1 ? null : readDestination(source, close + 1)
      if (destination !== null) {
        const alt = textOf(parseInline(source.slice(index + 2, close), context, false))
        flush()
        if (context.features.images) {
          if (!push({ kind: 'image', src: destination.url, alt })) break
        } else {
          buffer += alt
        }
        index = destination.end
        continue
      }
      buffer += character
      index += 1
      continue
    }

    if (character === '[' && context.features.attachments) {
      const attachment = ATTACHMENT.exec(source.slice(index))
      if (attachment !== null) {
        flush()
        if (!push({ kind: 'attachment', id: Number(attachment[1]) })) break
        index += attachment[0].length
        continue
      }
    }

    if (character === '[' && allowLinks && context.features.links) {
      const close = matchingBracket(source, index)
      const destination = close === -1 ? null : readDestination(source, close + 1)
      if (destination !== null) {
        const children = parseInline(source.slice(index + 1, close), context, false)
        flush()
        if (!push({ kind: 'link', href: destination.url, title: destination.title, children }))
          break
        index = destination.end
        continue
      }
      buffer += character
      index += 1
      continue
    }

    if (character === ':' && context.features.directives) {
      const match = /^:([a-z][a-z0-9]{0,15})\[/.exec(source.slice(index))
      if (match !== null && context.directives.has(match[1]!) && DIRECTIVE_NAME.test(match[1]!)) {
        const bracket = index + match[0].length - 1
        const close = matchingBracket(source, bracket)
        if (close !== -1) {
          const children = parseInline(source.slice(bracket + 1, close), context, allowLinks)
          flush()
          if (!push({ kind: 'directive', name: match[1]!, children })) break
          index = close + 1
          continue
        }
      }
      buffer += character
      index += 1
      continue
    }

    if (character === '@' && allowLinks && context.features.mentions) {
      const before = index === 0 ? undefined : source[index - 1]
      if (before === undefined || /[\s(<*_~]/.test(before)) {
        const rest = source.slice(index)
        const quoted = MENTION_QUOTED.exec(rest)
        const bare = quoted === null ? MENTION.exec(rest) : null

        let name: string | null = null
        let consumed = 0
        if (quoted !== null && MENTION_NAME.test(quoted[1]!)) {
          name = quoted[1]!
          consumed = quoted[0].length
        } else if (bare !== null) {
          name = bare[1]!.replace(/\.+$/, '')
          consumed = 1 + name.length
        }

        if (name !== null && name.length > 0 && name.length <= MENTION_MAX) {
          flush()
          if (!push({ kind: 'mention', name })) break
          index += consumed
          continue
        }
      }
      buffer += character
      index += 1
      continue
    }

    if (
      (character === '*' || character === '_' || character === '~') &&
      context.features.emphasis
    ) {
      let end = index
      while (end < source.length && source[end] === character) end += 1
      const run = source.slice(index, end)
      if (delimiters >= context.limits.maxDelimiters) {
        buffer += run
        index += run.length
        continue
      }
      const { canOpen, canClose } = flanking(source, index, index + run.length, character)
      if (!canOpen && !canClose) {
        buffer += run
        index += run.length
        continue
      }
      flush()
      delimiters += 1
      items.push({ t: 'delim', char: character, length: run.length, canOpen, canClose, raw: run })
      index += run.length
      continue
    }

    if (allowLinks && context.features.links) {
      const before = index === 0 ? undefined : source[index - 1]
      if (before === undefined || /[\s(<*_~]/.test(before)) {
        const bare = BARE_URL.exec(source.slice(index))
        if (bare !== null) {
          const url = trimBareUrl(bare[0])
          if (url.length > 0 && url.length <= context.limits.maxUrlLength) {
            flush()
            const href = url.toLowerCase().startsWith('www.') ? `https://${url}` : url
            if (
              !push({ kind: 'link', href, title: null, children: [{ kind: 'text', value: url }] })
            )
              break
            index += url.length
            continue
          }
        }
      }
    }

    buffer += character
    index += 1
  }

  flush()
  return resolveEmphasis(items, context)
}

function literal(items: readonly Item[]): Inline[] {
  const out: Inline[] = []
  for (const item of items) {
    const node: Inline = item.t === 'delim' ? { kind: 'text', value: item.raw } : item.node
    const last = out[out.length - 1]
    if (node.kind === 'text' && last !== undefined && last.kind === 'text') {
      out[out.length - 1] = { kind: 'text', value: last.value + node.value }
      continue
    }
    out.push(node)
  }
  return out
}

function resolveEmphasis(items: Item[], context: InlineContext): Inline[] {
  let index = 0
  while (index < items.length) {
    const closer = items[index]!
    if (closer.t !== 'delim' || !closer.canClose) {
      index += 1
      continue
    }

    let found = -1
    for (let back = index - 1; back >= 0; back -= 1) {
      const candidate = items[back]!
      if (candidate.t !== 'delim' || candidate.char !== closer.char || !candidate.canOpen) continue
      const bothWays = candidate.canClose || closer.canOpen
      const ruleOfThree =
        bothWays &&
        (candidate.length + closer.length) % 3 === 0 &&
        !(candidate.length % 3 === 0 && closer.length % 3 === 0)
      if (ruleOfThree) continue
      found = back
      break
    }

    if (found === -1) {
      index += 1
      continue
    }

    if (!context.budget.take()) break

    const opener = items[found] as Delimiter
    const strike = closer.char === '~'
    const use = strike
      ? Math.min(opener.length, closer.length, 2)
      : opener.length >= 2 && closer.length >= 2
        ? 2
        : 1

    const children = literal(items.slice(found + 1, index))
    const node: Inline = strike
      ? { kind: 'strike', children }
      : use === 2
        ? { kind: 'strong', children }
        : { kind: 'emphasis', children }

    opener.length -= use
    closer.length -= use

    const replacement: Item[] = []
    if (opener.length > 0) {
      replacement.push({ ...opener, raw: opener.raw.slice(0, opener.length) })
    }
    replacement.push({ t: 'node', node })
    if (closer.length > 0) {
      replacement.push({ ...closer, raw: closer.raw.slice(0, closer.length) })
    }

    items.splice(found, index - found + 1, ...replacement)
    index = found + replacement.length - (closer.length > 0 ? 1 : 0)
  }

  return literal(items)
}
