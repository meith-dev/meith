/**
 * F36 — source text to a flat token stream.
 *
 * Deliberately not a regex pass. MyBB renders BBCode with a pile of regular
 * expressions, which is why `[b]` inside `[code]` bolds, why nesting depth is
 * unbounded, and why several of its historical XSS reports were "the regex
 * matched something it should not have". A scanner gives one place where a `[`
 * either starts a tag or is text, and that decision is testable on its own.
 *
 * The scanner knows exactly one thing about the tag set: which tags take a
 * **raw body**. It has to, because `[code][/b][/code]` cannot be tokenised
 * correctly without knowing that the middle is text. That set is passed in
 * rather than imported, so this module has no dependency on the tag registry.
 */

export type BBToken =
  | { readonly kind: 'text'; readonly raw: string; readonly value: string }
  | {
      readonly kind: 'open'
      readonly raw: string
      readonly name: string
      readonly attribute: string | null
    }
  | { readonly kind: 'close'; readonly raw: string; readonly name: string }
  | {
      readonly kind: 'raw'
      readonly raw: string
      readonly name: string
      readonly attribute: string | null
      readonly value: string
    }

/**
 * The longest a tag may be, opening bracket to closing bracket.
 *
 * Without it, `[quote=` followed by 60KB of text and a `]` at the very end is
 * one tag with a 60KB attribute — a construct no human wrote, and one that
 * makes the attribute parsers the widest input surface in the package.
 */
const MAX_TAG_LENGTH = 256

/** `*` is here for `[*]`; digits are allowed after the first character only. */
const TAG_NAME = /^[a-z*][a-z0-9]{0,15}$/i

interface ScannedTag {
  readonly closing: boolean
  readonly name: string
  readonly attribute: string | null
  /** Index just past the `]`. */
  readonly end: number
}

/**
 * Read a tag beginning at `start` (which must be a `[`), or `null` if what is
 * there is not a tag and should be treated as text.
 */
function scanTag(source: string, start: number): ScannedTag | null {
  let index = start + 1
  const closing = source[index] === '/'
  if (closing) index += 1

  const nameStart = index
  while (index < source.length) {
    const character = source[index]!
    if (character === ']' || character === '=') break
    /*
     * A `[` before the closing `]` means the first bracket never opened a tag —
     * `[not a tag [b]bold[/b]` has to bold, which it only does if the scanner
     * gives up on the outer bracket rather than swallowing to the first `]`.
     */
    if (character === '[' || character === '\n') return null
    index += 1
  }
  if (index >= source.length) return null

  const name = source.slice(nameStart, index)
  if (!TAG_NAME.test(name)) return null

  if (source[index] === ']') {
    return { closing, name: name.toLowerCase(), attribute: null, end: index + 1 }
  }

  // `[/b=x]` is not a thing; a closing tag never carries an attribute.
  if (closing) return null

  const valueStart = index + 1
  index = valueStart
  while (index < source.length) {
    const character = source[index]!
    if (character === ']') break
    if (character === '[' || character === '\n') return null
    index += 1
  }
  if (index >= source.length) return null
  if (index + 1 - start > MAX_TAG_LENGTH) return null

  return {
    closing,
    name: name.toLowerCase(),
    attribute: source.slice(valueStart, index),
    end: index + 1,
  }
}

/**
 * Find `[/name]` from `from`, case-insensitively. Returns its start index.
 *
 * A regex rather than `indexOf` over a lowercased copy, because lowercasing can
 * change a string's *length* — `İ`.toLowerCase() is two code units — and every
 * index this function returns is then used to slice the original. One Turkish
 * capital İ earlier in a post would shift the cut and split the body mid-
 * character.
 */
function findRawClose(source: string, name: string, from: number): number {
  const pattern = new RegExp(`\\[/${name.replace(/[*]/g, '\\*')}\\]`, 'ig')
  pattern.lastIndex = from
  const match = pattern.exec(source)
  return match === null ? -1 : match.index
}

export interface TokeniseOptions {
  /** Tags whose body is verbatim text: `code`, and F37's additions. */
  readonly rawTags: ReadonlySet<string>
  /** Source beyond this many characters is emitted as one trailing text token. */
  readonly maxInput: number
}

export function tokenise(source: string, options: TokeniseOptions): BBToken[] {
  const limited = source.length > options.maxInput
  const text = limited ? source.slice(0, options.maxInput) : source
  const tokens: BBToken[] = []

  let buffer = ''
  let index = 0

  const flush = (): void => {
    if (buffer.length === 0) return
    tokens.push({ kind: 'text', raw: buffer, value: buffer })
    buffer = ''
  }

  while (index < text.length) {
    const open = text.indexOf('[', index)
    if (open === -1) {
      buffer += text.slice(index)
      break
    }
    buffer += text.slice(index, open)

    const tag = scanTag(text, open)
    if (tag === null) {
      buffer += '['
      index = open + 1
      continue
    }

    if (!tag.closing && options.rawTags.has(tag.name)) {
      const closeAt = findRawClose(text, tag.name, tag.end)
      if (closeAt === -1) {
        /*
         * An unterminated `[code]` is text, not a licence to swallow the rest
         * of the post. The alternative — treating end-of-input as the close —
         * turns one mistyped tag into a body where nothing else renders.
         */
        buffer += text.slice(open, tag.end)
        index = tag.end
        continue
      }
      flush()
      const end = closeAt + `[/${tag.name}]`.length
      tokens.push({
        kind: 'raw',
        raw: text.slice(open, end),
        name: tag.name,
        attribute: tag.attribute,
        value: text.slice(tag.end, closeAt),
      })
      index = end
      continue
    }

    flush()
    const raw = text.slice(open, tag.end)
    tokens.push(
      tag.closing
        ? { kind: 'close', raw, name: tag.name }
        : { kind: 'open', raw, name: tag.name, attribute: tag.attribute },
    )
    index = tag.end
  }

  flush()

  if (limited) {
    const tail = source.slice(options.maxInput)
    tokens.push({ kind: 'text', raw: tail, value: tail })
  }

  return tokens
}
