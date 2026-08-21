import { NodeBudget } from './budget'
import { type DirectiveRegistry, NO_DIRECTIVES, RESERVED_DIRECTIVE_NAMES } from './extensions'
import { FULL_FEATURES, type MarkdownFeatures } from './features'
import { type InlineContext, parseInline } from './inline'
import { DEFAULT_LIMITS, type MarkdownLimits } from './limits'
import type { Alignment, Block, ListItem, MarkdownDocument, TableCell } from './nodes'

export interface ParseOptions {
  readonly limits?: Partial<MarkdownLimits>
  readonly features?: MarkdownFeatures
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

function closesFence(line: string, marker: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < marker.length) return false
  if (indentOf(line) > 3) return false
  return trimmed.split('').every((character) => character === marker[0])
}

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

function isBlockDirective(name: string, directives: DirectiveRegistry): boolean {
  return RESERVED_DIRECTIVE_NAMES.has(name) || directives.block.has(name)
}

interface Context {
  readonly features: MarkdownFeatures
  readonly limits: MarkdownLimits
  readonly directives: DirectiveRegistry
  readonly budget: NodeBudget
  readonly inline: InlineContext
}

function startsBlock(line: string, context: Context): boolean {
  const { features } = context
  if (features.code && FENCE.test(line)) return true
  if (features.rules && RULE.test(line)) return true
  if (features.headings && ATX.test(line)) return true
  if (features.quotes && QUOTE.test(line)) return true
  if (features.lists && (BULLET.test(line) || ORDERED.test(line))) return true
  if (features.directives) {
    const directive = DIRECTIVE_OPEN.exec(line)
    if (directive !== null && isBlockDirective(directive[1]!, context.directives)) return true
  }
  return false
}

function splitRow(line: string): string[] {
  const trimmed = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
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

  const lines = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[ \t]+/, (run) => run.replace(/\t/g, '    ')))

  const blocks = parseBlocks(lines, context, 0)

  if (limited) {
    blocks.push({
      kind: 'paragraph',
      inline: [{ kind: 'text', value: source.slice(limits.maxInput) }],
    })
  }

  return { blocks, truncated: limited || budget.exhausted }
}

function parseBlocks(lines: readonly string[], context: Context, depth: number): Block[] {
  const blocks: Block[] = []
  let index = 0

  const add = (block: Block): boolean => {
    if (!context.budget.take()) return false
    blocks.push(block)
    return true
  }

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

    const fence = context.features.code ? FENCE.exec(line) : null
    if (fence !== null) {
      const marker = fence[2]!
      const language = fence[3]!.split(/\s+/)[0] ?? ''
      const indent = fence[1]!.length
      let end = index + 1
      while (end < lines.length && !closesFence(lines[end]!, marker)) end += 1
      const value = lines
        .slice(index + 1, end)
        .map((candidate) => stripIndent(candidate, indent))
        .join('\n')
      if (!add({ kind: 'code', language: language === '' ? null : language, value })) {
        surrender(index)
        break
      }
      index = end + 1
      continue
    }

    if (context.features.rules && RULE.test(line)) {
      if (!add({ kind: 'rule' })) {
        surrender(index)
        break
      }
      index += 1
      continue
    }

    const atx = context.features.headings ? ATX.exec(line) : null
    if (atx !== null) {
      const level = atx[1]!.length as 1 | 2 | 3 | 4 | 5 | 6
      const text = (atx[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '')
      if (!add({ kind: 'heading', level, inline: parseInline(text, context.inline) })) {
        surrender(index)
        break
      }
      index += 1
      continue
    }

    const directive = context.features.directives ? DIRECTIVE_OPEN.exec(line) : null
    if (directive !== null && isBlockDirective(directive[1]!, context.directives)) {
      if (depth >= context.limits.maxDepth) {
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

    const paragraph: string[] = [line]
    let end = index + 1
    let heading: 1 | 2 | null = null
    while (end < lines.length) {
      const candidate = lines[end]!
      const setext = context.features.headings ? SETEXT.exec(candidate) : null
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
        heading === null
          ? { kind: 'paragraph', inline }
          : { kind: 'heading', level: heading, inline }
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
  readonly width: number
  readonly delimiter: string
}

function listMarker(line: string): Marker | null {
  const bullet = BULLET.exec(line)
  if (bullet !== null) {
    const spaces = bullet[3] === '' ? 1 : bullet[3]!.length
    return {
      ordered: false,
      start: 1,
      width: bullet[1]!.length + 1 + spaces,
      delimiter: bullet[2]!,
    }
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
    if (marker === null || marker.ordered !== first.ordered || marker.delimiter !== first.delimiter)
      break

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
      itemLines.push(candidate.trimStart())
      index += 1
    }

    while (itemLines.length > 0 && isBlank(itemLines[itemLines.length - 1])) itemLines.pop()
    if (itemLines.some(isBlank)) loose = true
    if (trailingBlanks > 0 && index < lines.length && listMarker(lines[index]!) !== null)
      loose = true

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
    block: {
      kind: 'list',
      ordered: first.ordered,
      start: first.ordered ? first.start : 1,
      tight: !loose,
      items,
    },
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
    rows.push(Array.from({ length: header.length }, (_unused, column) => cell(cells[column] ?? '')))
    index += 1
    if (context.budget.spent) break
  }

  return {
    block: { kind: 'table', head: header.map(cell), align, rows },
    end: index,
  }
}
