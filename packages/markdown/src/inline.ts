/**
 * F36 — one paragraph's worth of source, to inline nodes.
 *
 * Deliberately not a pile of regular expressions. The old BBCode renderer made
 * the same choice for the same reason, and Markdown makes the argument harder
 * to refuse: `*` means emphasis or a bullet or a literal asterisk depending on
 * what is either side of it, and every board that has tried to settle that with
 * a global replace has ended up with `2 * 3 * 4` in italics and a security
 * advisory about the one case where the pattern matched across a `<`.
 *
 * So this is a scanner with one decision per character, then a second pass that
 * pairs emphasis delimiters. Two properties fall out, and both are what the
 * renderer's safety argument rests on:
 *
 *  - **No output is produced here.** This builds nodes holding *source text*.
 *    Escaping happens in `render.ts`, once, in one place.
 *  - **Nothing is ever dropped.** A `[` that turns out not to open a link, a
 *    `*` that never finds a partner, an unterminated code span: each becomes
 *    the character it is. There is no input for which this loses a word.
 */
import type { NodeBudget } from './budget'
import type { MarkdownFeatures } from './features'
import type { MarkdownLimits } from './limits'
import type { Inline } from './nodes'
import { textOf } from './nodes'

export interface InlineContext {
  readonly features: MarkdownFeatures
  readonly limits: MarkdownLimits
  /** Inline directive names this board has defined (F71). */
  readonly directives: ReadonlySet<string>
  readonly budget: NodeBudget
}

/** ASCII and Unicode punctuation, which the flanking rules are defined against. */
const PUNCTUATION = /[!-#%-*,-/:;?@[-\]_{}\p{P}\p{S}]/u

/** Characters `\` may escape. Anything else keeps its backslash. */
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/

/** A directive name: what the ACP will accept, restated where it is parsed. */
const DIRECTIVE_NAME = /^[a-z][a-z0-9]{0,15}$/

/**
 * A bare URL, autolinked.
 *
 * `www.` is included because members type it and expect a link; it is emitted
 * with an explicit `https://` rather than a scheme-relative href, so there is
 * exactly one place — `safeUrl` — deciding what a scheme may be.
 */
const BARE_URL = /^(https?:\/\/|www\.)[^\s<]*/i

/** `<https://…>` and `<someone@example.com>`. */
const AUTOLINK = /^<([a-z][a-z0-9+.-]{1,31}:[^\s<>]*)>/i
const AUTOLINK_EMAIL = /^<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/

type Delimiter = {
  readonly t: 'delim'
  readonly char: string
  length: number
  readonly canOpen: boolean
  readonly canClose: boolean
  /** The run as typed, for when it never pairs and becomes text. */
  readonly raw: string
}

type Item = { readonly t: 'node'; readonly node: Inline } | Delimiter

function isWhitespace(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character)
}

function isPunctuation(character: string | undefined): boolean {
  return character !== undefined && PUNCTUATION.test(character)
}

/**
 * CommonMark's flanking rules, which are the whole reason `snake_case_names`
 * do not come out half italic and `2 * 3 * 4` comes out as arithmetic.
 */
function flanking(
  source: string,
  start: number,
  end: number,
  char: string,
): { canOpen: boolean; canClose: boolean } {
  const before = start === 0 ? undefined : source[start - 1]
  const after = end >= source.length ? undefined : source[end]

  const leftFlanking =
    !isWhitespace(after) &&
    (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before))
  const rightFlanking =
    !isWhitespace(before) &&
    (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after))

  /*
   * `_` is stricter than `*` on purpose, and it is the rule people feel rather
   * than read: it may not open or close *inside* a word. Without it every
   * `file_name_here` in every post about code is two italics and a bug report.
   */
  if (char === '_') {
    return {
      canOpen: leftFlanking && (!rightFlanking || isPunctuation(before)),
      canClose: rightFlanking && (!leftFlanking || isPunctuation(after)),
    }
  }
  return { canOpen: leftFlanking, canClose: rightFlanking }
}

/** The index just past a balanced `]`, or -1. Skips escapes and code spans. */
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
  /** Index just past the closing `)`. */
  readonly end: number
}

/**
 * `(url)`, `(url "title")`, `(<url with spaces> 'title')`.
 *
 * Bare destinations balance their parentheses, because half the URLs on the
 * internet that need this are Wikipedia articles ending in `(disambiguation)`.
 */
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
    url = unescape(source.slice(start, index))
  }

  while (index < source.length && /\s/.test(source[index]!)) index += 1

  let title: string | null = null
  const opener = source[index]
  if (opener === '"' || opener === "'" || opener === '(') {
    const closer = opener === '(' ? ')' : opener
    const close = source.indexOf(closer, index + 1)
    if (close === -1) return null
    title = unescape(source.slice(index + 1, close))
    index = close + 1
    while (index < source.length && /\s/.test(source[index]!)) index += 1
  }

  if (source[index] !== ')') return null
  return { url: url.trim(), title, end: index + 1 }
}

/** Resolve backslash escapes in a run of text. */
function unescape(value: string): string {
  return value.replace(/\\(.)/gs, (whole, character: string) =>
    ESCAPABLE.test(character) ? character : whole,
  )
}

/**
 * Trailing punctuation a bare URL should not have swallowed.
 *
 * A sentence ending "…see https://example.com." means the full stop is the
 * sentence's, not the URL's. Closing brackets are only given back when they are
 * unbalanced, so a link to `…/Foo_(bar)` keeps its parenthesis.
 */
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

/**
 * Parse one run of inline source.
 *
 * `allowLinks` goes false inside a link's own text: a link inside a link has no
 * meaning in HTML and nesting one produces markup a browser silently unnests,
 * which is the difference between what the author sees in preview and what the
 * thread shows.
 */
export function parseInline(
  source: string,
  context: InlineContext,
  allowLinks = true,
): Inline[] {
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
    /*
     * Text runs do not each cost a node: a paragraph is mostly text, and
     * charging for it would mean the allowance was really a character limit
     * wearing a node limit's name.
     */
    items.push({ t: 'node', node: { kind: 'text', value: buffer } })
    buffer = ''
  }

  while (index < source.length) {
    if (context.budget.spent) {
      /* Out of allowance: the rest of this run is the text it is. */
      context.budget.exhaust()
      buffer += source.slice(index)
      break
    }
    const character = source[index]!

    /* An escape is the one construct that always wins, so `\*` is never a delimiter. */
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
      /*
       * The spaces that indent the next line of a wrapped paragraph are the
       * author's editor, not their intent. Dropped so a soft-wrapped list item
       * does not render with a gap after every break.
       */
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
        /* A longer run is a different fence, not this one's close. */
        if (source[at + run.length] === '`') {
          search = at + /^`+/.exec(source.slice(at))![0].length
          continue
        }
        close = at
        break
      }
      if (close !== -1) {
        let value = source.slice(index + run.length, close).replace(/\n/g, ' ')
        /* ``` `` ` `` ``` is how you write a lone backtick; the padding is not content. */
        if (value.length > 2 && value.startsWith(' ') && value.endsWith(' ') && value.trim() !== '') {
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
        if (!push({ kind: 'link', href: scheme[1]!, title: null, children: [{ kind: 'text', value: scheme[1]! }] })) break
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
        /*
         * With images off the alt text is kept and the image is not. A member
         * whose signature is one image sees the words they wrote rather than a
         * blank line, which is the difference between a rule and a trap.
         */
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

    if (character === '[' && allowLinks && context.features.links) {
      const close = matchingBracket(source, index)
      const destination = close === -1 ? null : readDestination(source, close + 1)
      if (destination !== null) {
        const children = parseInline(source.slice(index + 1, close), context, false)
        flush()
        if (!push({ kind: 'link', href: destination.url, title: destination.title, children })) break
        index = destination.end
        continue
      }
      buffer += character
      index += 1
      continue
    }

    /* `:name[…]` — an inline directive, if this board has defined that name. */
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

    if ((character === '*' || character === '_' || character === '~') && context.features.emphasis) {
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
      /*
       * Only at a boundary. Without this, `foohttps://x` links and — worse —
       * the tail of a URL already inside a `[text](href)` would be autolinked
       * a second time.
       */
      if (before === undefined || /[\s(<*_~]/.test(before)) {
        const bare = BARE_URL.exec(source.slice(index))
        if (bare !== null) {
          const url = trimBareUrl(bare[0])
          if (url.length > 0 && url.length <= context.limits.maxUrlLength) {
            flush()
            const href = url.toLowerCase().startsWith('www.') ? `https://${url}` : url
            if (!push({ kind: 'link', href, title: null, children: [{ kind: 'text', value: url }] })) break
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

/** An unpaired delimiter run is the characters it is made of. */
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

/**
 * CommonMark's "process emphasis": pair each closer with the nearest opener.
 *
 * Left to right, so the innermost pair is always resolved first and
 * `**a *b* c**` nests the way it reads. The odd-looking modulo is CommonMark's
 * rule of three, which exists so that `*foo**bar**baz*` is one emphasis
 * containing one strong, rather than the three overlapping spans a naive
 * matcher produces.
 */
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

    /*
     * Out of allowance. Pairing stops here rather than half-building a node:
     * every delimiter still standing falls through to `literal` below and
     * renders as the asterisks somebody typed.
     */
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
    /* Land on whatever is left of the closer, so `***a***` resolves both halves. */
    index = found + replacement.length - (closer.length > 0 ? 1 : 0)
  }

  return literal(items)
}
