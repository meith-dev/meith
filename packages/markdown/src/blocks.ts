/**
 * F36 — source text to a block tree.
 *
 * Markdown is a **line** grammar wrapped around an inline one, so this file
 * works in lines and hands runs of prose to `inline.ts`. Three rules decide
 * everything it does, and they are the three places a forum's renderer usually
 * goes wrong:
 *
 *  1. **Nothing a member typed is ever dropped.** A fence that never closes, a
 *     table whose rows do not line up, a `:::` block for a directive this board
 *     has not defined: each degrades to the text it is. There is no input for
 *     which this loses a word, and no input for which it throws.
 *  2. **No raw HTML, ever.** CommonMark says an HTML block passes through
 *     untouched. That is a sanitiser's problem, and this package's whole safety
 *     argument is that it never has one — output is *constructed*, never
 *     cleaned. So `<script>` in a post is four escaped characters and a word,
 *     the same as it was under BBCode.
 *  3. **A newline is a line break.** CommonMark folds a single newline into a
 *     space, which is correct for documents and wrong for a message box: people
 *     write addresses, set lists and poetry in posts and press Return where
 *     they mean it. Every forum-flavoured Markdown ever shipped has made this
 *     same change, and a member who has to type two trailing spaces to get a
 *     line break will type them once, see nothing, and go back to BBCode.
 *
 * ## What is deliberately not implemented
 *
 * - **Indented code blocks.** Four spaces of indent is what a pasted, wrapped
 *   or hand-aligned paragraph looks like, and turning that into a code block is
 *   the single most common "Markdown ate my post" complaint. Fenced code is the
 *   one way, and it is the one the composer's toolbar inserts.
 * - **Reference links** (`[text][id]` with a definition elsewhere). They are a
 *   document-author's convenience; in a post they read as a broken link to
 *   everyone who cannot see the definition, and they cost a second pass.
 * - **Raw HTML**, per rule 2.
 *
 * All three are recorded in `docs/deviations.md`, because a Markdown that is
 * not CommonMark has to say so.
 */
import { NodeBudget } from './budget'
import { NO_DIRECTIVES, type DirectiveRegistry } from './extensions'
import { FULL_FEATURES, type MarkdownFeatures } from './features'
import { parseInline, type InlineContext } from './inline'
import { DEFAULT_LIMITS, type MarkdownLimits } from './limits'
import type { Alignment, Block, ListItem, MarkdownDocument, TableCell } from './nodes'

export interface ParseOptions {
  readonly limits?: Partial<MarkdownLimits>
  /** Which constructs are allowed. Defaults to everything (F58 narrows it). */
  readonly features?: MarkdownFeatures
  /** Directive names this board has defined (F71). */
  readonly directives?: DirectiveRegistry
}

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\n]*?)[ \t]*$/
const RULE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const QUOTE = /^ {0,3}>[ ]?/
const BULLET = /^( {0,3})([-+*])([ \t]+|$)/
const ORDERED = /^( {0,3})(\d{1,9})([.)])([ \t]+|$)/
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/
const DIRECTIVE_OPEN = /^ {0,3}:::[ \t]*([a-z][a-z0-9]{0,15})[ \t]*$/
const DIRECTIVE_CLOSE = /^ {0,3}:::[ \t]*$/
const TASK = /^\[([ xX])\][ \t]+/
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/

/** A fence closes on a run of its own character, at least as long as it was. */
function closesFence(line: string, marker: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < marker.length) return false
  if (indentOf(line) > 3) return false
  return trimmed.split('').every((character) => character === marker[0])
}

/** Remove up to `count` leading spaces, and no more. */
function stripIndent(line: string, count: number): string {
  let removed = 0
  while (removed < count && line[removed] === ' ') removed += 1
  return line.slice(removed)
}

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === ''
}

function indentOf(line: string): number {
  let count = 0
  while (line[count] === ' ') count += 1
  return count
}

interface Context {
  readonly features: MarkdownFeatures
  readonly limits: MarkdownLimits
  readonly directives: DirectiveRegistry
  readonly budget: NodeBudget
  readonly inline: InlineContext
}

/** Does this line begin a block, and therefore end an open paragraph? */
function startsBlock(line: string, context: Context): boolean {
  const { features } = context
  if (features.code && FENCE.test(line)) return true
  if (features.rules && RULE.test(line)) return true
  if (features.headings && ATX.test(line)) return true
  if (features.quotes && QUOTE.test(line)) return true
  if (features.lists && (BULLET.test(line) || ORDERED.test(line))) return true
  if (features.directives) {
    /*
     * Only a directive this board has *defined* interrupts a paragraph. An
     * undefined `:::whatever` is prose, and breaking the paragraph around it
     * would put a gap in somebody's post over a name that renders as itself.
     */
    const directive = DIRECTIVE_OPEN.exec(line)
    if (directive !== null && context.directives.block.has(directive[1]!)) return true
  }
  return false
}

/**
 * Split a table row on `|`, honouring `\|`.
 *
 * A pipe inside a code span is *not* honoured, which is GFM's rule and not an
 * oversight: the alternative is a row-splitter that has to run the whole inline
 * scanner to find out how many cells a row has.
 */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  const cells: string[] = []
  let current = ''
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index]!
    if (character === '\\' && trimmed[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }
    if (character === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  cells.push(current.trim())
  return cells
}

function alignmentOf(cell: string): Alignment {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

export function parse(source: string, options: ParseOptions = {}): MarkdownDocument {
  const limits: MarkdownLimits = { ...DEFAULT_LIMITS, ...options.limits }
  const features = options.features ?? FULL_FEATURES
  const directives = options.directives ?? NO_DIRECTIVES
  const budget = new NodeBudget(limits.maxNodes)

  const context: Context = {
    features,
    limits,
    directives,
    budget,
    inline: { features, limits, directives: directives.inline, budget },
  }

  const limited = source.length > limits.maxInput
  const body = limited ? source.slice(0, limits.maxInput) : source

  /*
   * Tabs become spaces before anything else looks at indentation. Every rule
   * below counts leading spaces, and a tab that still counted as one character
   * would make `\t- item` a top-level bullet on one board and a nested one on
   * the next depending on how the author's editor was configured.
   */
  const lines = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[ \t]+/, (run) => run.replace(/\t/g, '    ')))

  const blocks = parseBlocks(lines, context, 0)

  if (limited) {
    /*
     * The tail past `maxInput` is appended verbatim rather than discarded. A
     * post that reaches this is pathological, but it is still somebody's post,
     * and losing its second half silently is a data-loss bug reported as "my
     * long post is cut off".
     */
    blocks.push({ kind: 'paragraph', inline: [{ kind: 'text', value: source.slice(limits.maxInput) }] })
  }

  return { blocks, truncated: limited || budget.exhausted }
}

/** One container's worth of lines. Recurses for quotes, list items, directives. */
function parseBlocks(lines: readonly string[], context: Context, depth: number): Block[] {
  const blocks: Block[] = []
  let index = 0

  const add = (block: Block): boolean => {
    if (!context.budget.take()) return false
    blocks.push(block)
    return true
  }

  /**
   * Everything from `from` on, as one unformatted paragraph.
   *
   * Reaching this *is* what `truncated` means, so it says so — a body that ran
   * out of allowance mid-way and one that was refused its next node are the
   * same thing to the person reading it.
   */
  const surrender = (from: number): void => {
    context.budget.exhaust()
    const rest = lines.slice(from).join('\n').trim()
    if (rest === '') return
    blocks.push({ kind: 'paragraph', inline: [{ kind: 'text', value: rest }] })
  }

  while (index < lines.length) {
    if (context.budget.spent) {
      surrender(index)
      break
    }

    const line = lines[index]!

    if (isBlank(line)) {
      index += 1
      continue
    }

    /* ---- fenced code ---- */
    const fence = context.features.code ? FENCE.exec(line) : null
    if (fence !== null) {
      const marker = fence[2]!
      const language = fence[3]!.split(/\s+/)[0] ?? ''
      const indent = fence[1]!.length
      let end = index + 1
      while (end < lines.length && !closesFence(lines[end]!, marker)) end += 1
      const value = lines
        .slice(index + 1, end)
        /* The fence's own indentation comes off its body; the author's stays. */
        .map((candidate) => stripIndent(candidate, indent))
        .join('\n')
      if (!add({ kind: 'code', language: language === '' ? null : language, value })) {
        surrender(index)
        break
      }
      /*
       * `end + 1` even when the fence was never closed: end-of-input closes it.
       * The alternative — treating an unclosed fence as text — would take a
       * post whose author forgot three backticks and render the code they were
       * quoting as formatting, which is the worse of the two failures.
       */
      index = end + 1
      continue
    }

    /* ---- thematic break ---- */
    if (context.features.rules && RULE.test(line)) {
      if (!add({ kind: 'rule' })) {
        surrender(index)
        break
      }
      index += 1
      continue
    }

    /* ---- ATX heading ---- */
    const atx = context.features.headings ? ATX.exec(line) : null
    if (atx !== null) {
      const level = atx[1]!.length as 1 | 2 | 3 | 4 | 5 | 6
      /* `### Heading ###` — a closing run is decoration, not content. */
      const text = (atx[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '')
      if (!add({ kind: 'heading', level, inline: parseInline(text, context.inline) })) {
        surrender(index)
        break
      }
      index += 1
      continue
    }

    /* ---- block directive ---- */
    const directive = context.features.directives ? DIRECTIVE_OPEN.exec(line) : null
    if (directive !== null && context.directives.block.has(directive[1]!)) {
      if (depth >= context.limits.maxDepth) {
        /* Too deep to open one. The marker stays as text and the body renders. */
        blocks.push({ kind: 'paragraph', inline: [{ kind: 'text', value: line.trim() }] })
        index += 1
        continue
      }
      let end = index + 1
      while (end < lines.length && !DIRECTIVE_CLOSE.test(lines[end]!)) end += 1
      const children = parseBlocks(lines.slice(index + 1, end), context, depth + 1)
      if (!add({ kind: 'directive', name: directive[1]!, children })) {
        surrender(index)
        break
      }
      index = end + 1
      continue
    }

    /* ---- blockquote ---- */
    if (context.features.quotes && QUOTE.test(line)) {
      if (depth >= context.limits.maxDepth) {
        blocks.push({ kind: 'paragraph', inline: [{ kind: 'text', value: line }] })
        index += 1
        continue
      }
      const inner: string[] = []
      let end = index
      while (end < lines.length) {
        const candidate = lines[end]!
        if (QUOTE.test(candidate)) {
          inner.push(candidate.replace(QUOTE, ''))
          end += 1
          continue
        }
        /*
         * Lazy continuation: a wrapped line under a `>` belongs to the quote,
         * because that is what people's editors produce and what every other
         * Markdown does. It stops at a blank line or at anything that would
         * open a block of its own.
         */
        if (isBlank(candidate) || startsBlock(candidate, context)) break
        if (isBlank(lines[end - 1])) break
        inner.push(candidate)
        end += 1
      }
      const children = parseBlocks(inner, context, depth + 1)
      if (!add({ kind: 'quote', children })) {
        surrender(index)
        break
      }
      index = end
      continue
    }

    /* ---- list ---- */
    const marker = context.features.lists ? listMarker(line) : null
    if (marker !== null) {
      if (depth >= context.limits.maxDepth) {
        blocks.push({ kind: 'paragraph', inline: [{ kind: 'text', value: line }] })
        index += 1
        continue
      }
      const list = readList(lines, index, context, depth)
      if (!add(list.block)) {
        surrender(index)
        break
      }
      index = list.end
      continue
    }

    /* ---- table ---- */
    if (
      context.features.tables &&
      line.includes('|') &&
      index + 1 < lines.length &&
      TABLE_DELIMITER.test(lines[index + 1]!) &&
      splitRow(lines[index + 1]!).length === splitRow(line).length
    ) {
      const table = readTable(lines, index, context)
      if (!add(table.block)) {
        surrender(index)
        break
      }
      index = table.end
      continue
    }

    /* ---- paragraph, and the setext heading it can turn into ---- */
    const paragraph: string[] = [line]
    let end = index + 1
    let heading: 1 | 2 | null = null
    while (end < lines.length) {
      const candidate = lines[end]!
      const setext = context.features.headings ? SETEXT.exec(candidate) : null
      /*
       * `---` under a paragraph is a heading; on its own it is a rule. Checked
       * before `startsBlock` for exactly that reason — the order *is* the rule.
       */
      if (setext !== null) {
        heading = setext[1]!.startsWith('=') ? 1 : 2
        end += 1
        break
      }
      if (isBlank(candidate) || startsBlock(candidate, context)) break
      if (
        context.features.tables &&
        candidate.includes('|') &&
        end + 1 < lines.length &&
        TABLE_DELIMITER.test(lines[end + 1]!) &&
        splitRow(lines[end + 1]!).length === splitRow(candidate).length
      ) {
        break
      }
      paragraph.push(candidate)
      end += 1
    }

    const text = paragraph.join('\n').trim()
    if (text !== '') {
      const inline = parseInline(text, context.inline)
      const block: Block =
        heading === null ? { kind: 'paragraph', inline } : { kind: 'heading', level: heading, inline }
      if (!add(block)) {
        surrender(index)
        break
      }
    }
    index = end
  }

  return blocks
}

interface Marker {
  readonly ordered: boolean
  readonly start: number
  /** Columns the item's content is indented by, marker included. */
  readonly width: number
  /** `-`, `*`, `+`, `.` or `)` — a change of these starts a new list. */
  readonly delimiter: string
}

function listMarker(line: string): Marker | null {
  const bullet = BULLET.exec(line)
  if (bullet !== null) {
    const spaces = bullet[3] === '' ? 1 : bullet[3]!.length
    return { ordered: false, start: 1, width: bullet[1]!.length + 1 + spaces, delimiter: bullet[2]! }
  }
  const ordered = ORDERED.exec(line)
  if (ordered !== null) {
    const spaces = ordered[4] === '' ? 1 : ordered[4]!.length
    return {
      ordered: true,
      start: Number(ordered[2]),
      width: ordered[1]!.length + ordered[2]!.length + 1 + spaces,
      delimiter: ordered[3]!,
    }
  }
  return null
}

/**
 * One list, from `from`.
 *
 * A list ends at the first line that is neither an item of the same kind nor
 * indented into one. Changing the bullet character or the ordered delimiter
 * ends it too, which is how somebody writes two adjacent lists without a
 * heading between them.
 */
function readList(
  lines: readonly string[],
  from: number,
  context: Context,
  depth: number,
): { block: Block; end: number } {
  const first = listMarker(lines[from]!)!
  const items: ListItem[] = []
  let loose = false
  let index = from

  while (index < lines.length) {
    const marker = listMarker(lines[index]!)
    if (marker === null || marker.ordered !== first.ordered || marker.delimiter !== first.delimiter) break

    const itemLines: string[] = [lines[index]!.slice(marker.width)]
    index += 1

    let trailingBlanks = 0
    while (index < lines.length) {
      const candidate = lines[index]!
      if (isBlank(candidate)) {
        itemLines.push('')
        trailingBlanks += 1
        index += 1
        continue
      }
      if (indentOf(candidate) >= marker.width) {
        itemLines.push(candidate.slice(marker.width))
        trailingBlanks = 0
        index += 1
        continue
      }
      if (listMarker(candidate) !== null) break
      if (trailingBlanks > 0 || startsBlock(candidate, context)) break
      /* A wrapped line under an item belongs to the item. */
      itemLines.push(candidate.trimStart())
      index += 1
    }

    while (itemLines.length > 0 && isBlank(itemLines[itemLines.length - 1])) itemLines.pop()
    if (itemLines.some(isBlank)) loose = true
    /* A blank line before the next item makes the whole list loose, per CommonMark. */
    if (trailingBlanks > 0 && index < lines.length && listMarker(lines[index]!) !== null) loose = true

    let checked: boolean | null = null
    const task = TASK.exec(itemLines[0] ?? '')
    if (task !== null) {
      checked = task[1]!.toLowerCase() === 'x'
      itemLines[0] = itemLines[0]!.slice(task[0].length)
    }

    items.push({ checked, children: parseBlocks(itemLines, context, depth + 1) })
    if (context.budget.spent) break
  }

  return {
    block: { kind: 'list', ordered: first.ordered, start: first.ordered ? first.start : 1, tight: !loose, items },
    end: index,
  }
}

function readTable(
  lines: readonly string[],
  from: number,
  context: Context,
): { block: Block; end: number } {
  const header = splitRow(lines[from]!)
  const align = splitRow(lines[from + 1]!).map(alignmentOf)
  const cell = (value: string): TableCell => ({ inline: parseInline(value, context.inline) })

  const rows: TableCell[][] = []
  let index = from + 2
  while (index < lines.length) {
    const line = lines[index]!
    if (isBlank(line) || !line.includes('|')) break
    if (startsBlock(line, context)) break
    const cells = splitRow(line)
    /*
     * A short row is padded and a long one is cut, which is GFM's rule. The
     * alternative — refusing the table — throws away a table somebody can see
     * is a table because they miscounted one pipe.
     */
    rows.push(
      Array.from({ length: header.length }, (_unused, column) => cell(cells[column] ?? '')),
    )
    index += 1
    if (context.budget.spent) break
  }

  return {
    block: { kind: 'table', head: header.map(cell), align, rows },
    end: index,
  }
}
