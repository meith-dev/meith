import type { Locale } from './locale'

export type MessageValue = string | number | bigint | boolean | Date | null | undefined

export type MessageArgs = Readonly<Record<string, MessageValue>>

export class MessageSyntaxError extends Error {
  constructor(
    message: string,
    readonly pattern: string,
    readonly offset: number,
  ) {
    super(`${message} (offset ${offset}) in ${JSON.stringify(pattern)}`)
    this.name = 'MessageSyntaxError'
  }
}

type Node =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'hash' }
  | { readonly kind: 'value'; readonly name: string }
  | { readonly kind: 'number'; readonly name: string; readonly style: string | null }
  | { readonly kind: 'date'; readonly name: string; readonly style: string | null }
  | { readonly kind: 'time'; readonly name: string; readonly style: string | null }
  | {
      readonly kind: 'plural'
      readonly name: string
      readonly ordinal: boolean
      readonly offset: number
      readonly branches: ReadonlyMap<string, readonly Node[]>
    }
  | {
      readonly kind: 'select'
      readonly name: string
      readonly branches: ReadonlyMap<string, readonly Node[]>
    }

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])

class Parser {
  private at = 0

  constructor(private readonly pattern: string) {}

  parse(): readonly Node[] {
    const nodes = this.parseNodes(false)
    if (this.at < this.pattern.length) {
      throw new MessageSyntaxError('unbalanced "}"', this.pattern, this.at)
    }
    return nodes
  }

  private parseNodes(nested: boolean): readonly Node[] {
    const nodes: Node[] = []
    let text = ''

    const flush = () => {
      if (text !== '') nodes.push({ kind: 'text', value: text })
      text = ''
    }

    while (this.at < this.pattern.length) {
      const char = this.pattern[this.at]

      if (char === '}') break

      if (char === '{') {
        flush()
        nodes.push(this.parseArgument())
        continue
      }

      if (char === '#' && nested) {
        flush()
        nodes.push({ kind: 'hash' })
        this.at += 1
        continue
      }

      if (char === "'") {
        text += this.readQuoted()
        continue
      }

      text += char
      this.at += 1
    }

    flush()
    return nodes
  }

  private readQuoted(): string {
    const next = this.pattern[this.at + 1]

    if (next === "'") {
      this.at += 2
      return "'"
    }

    if (next !== '{' && next !== '}' && next !== '#') {
      this.at += 1
      return "'"
    }

    this.at += 1
    let literal = ''

    while (this.at < this.pattern.length) {
      if (this.pattern[this.at] === "'") {
        if (this.pattern[this.at + 1] === "'") {
          literal += "'"
          this.at += 2
          continue
        }
        this.at += 1
        return literal
      }
      literal += this.pattern[this.at]
      this.at += 1
    }

    return literal
  }

  private parseArgument(): Node {
    const opened = this.at
    this.at += 1
    this.skipSpace()

    const name = this.readName()
    if (name === '') throw new MessageSyntaxError('placeholder with no name', this.pattern, opened)

    this.skipSpace()

    if (this.pattern[this.at] === '}') {
      this.at += 1
      return { kind: 'value', name }
    }

    this.expect(',', opened)
    this.skipSpace()

    const type = this.readName()
    this.skipSpace()

    if (type === 'plural' || type === 'selectordinal') {
      this.expect(',', opened)
      const offset = this.readOffset()
      const branches = this.parseBranches(opened, true)
      return { kind: 'plural', name, ordinal: type === 'selectordinal', offset, branches }
    }

    if (type === 'select') {
      this.expect(',', opened)
      const branches = this.parseBranches(opened, false)
      return { kind: 'select', name, branches }
    }

    let style: string | null = null
    if (this.pattern[this.at] === ',') {
      this.at += 1
      this.skipSpace()
      style = this.readUntilClose()
    }

    this.expect('}', opened)

    if (type === 'number') return { kind: 'number', name, style }
    if (type === 'date') return { kind: 'date', name, style }
    if (type === 'time') return { kind: 'time', name, style }

    throw new MessageSyntaxError(`unknown placeholder type "${type}"`, this.pattern, opened)
  }

  private parseBranches(opened: number, plural: boolean): ReadonlyMap<string, readonly Node[]> {
    const branches = new Map<string, readonly Node[]>()

    for (;;) {
      this.skipSpace()
      if (this.pattern[this.at] === '}') {
        this.at += 1
        break
      }
      if (this.at >= this.pattern.length) {
        throw new MessageSyntaxError('unterminated placeholder', this.pattern, opened)
      }

      const selector = this.readSelector()
      if (selector === '') {
        throw new MessageSyntaxError('branch with no selector', this.pattern, this.at)
      }
      if (plural && !selector.startsWith('=') && !PLURAL_CATEGORIES.has(selector)) {
        throw new MessageSyntaxError(`unknown plural category "${selector}"`, this.pattern, this.at)
      }

      this.skipSpace()
      this.expect('{', opened)
      branches.set(selector, this.parseNodes(plural))
      this.expect('}', opened)
    }

    if (!branches.has('other')) {
      throw new MessageSyntaxError('no "other" branch', this.pattern, opened)
    }

    return branches
  }

  private readOffset(): number {
    const match = /^\s*offset\s*:\s*(-?\d+)/.exec(this.pattern.slice(this.at))
    if (match?.[1] === undefined) return 0
    this.at += match[0].length
    return Number.parseInt(match[1], 10)
  }

  private readName(): string {
    const start = this.at
    while (this.at < this.pattern.length && /[\w.-]/.test(this.pattern[this.at] ?? '')) {
      this.at += 1
    }
    return this.pattern.slice(start, this.at)
  }

  private readSelector(): string {
    const start = this.at
    while (this.at < this.pattern.length && /[\w.=-]/.test(this.pattern[this.at] ?? '')) {
      this.at += 1
    }
    return this.pattern.slice(start, this.at)
  }

  private readUntilClose(): string {
    const start = this.at
    let depth = 0
    while (this.at < this.pattern.length) {
      const char = this.pattern[this.at]
      if (char === '{') depth += 1
      else if (char === '}') {
        if (depth === 0) break
        depth -= 1
      }
      this.at += 1
    }
    return this.pattern.slice(start, this.at).trim()
  }

  private skipSpace(): void {
    while (/\s/.test(this.pattern[this.at] ?? '')) this.at += 1
  }

  private expect(char: string, opened: number): void {
    if (this.pattern[this.at] !== char) {
      throw new MessageSyntaxError(`expected "${char}"`, this.pattern, this.at || opened)
    }
    this.at += 1
  }
}

const parsed = new Map<string, readonly Node[]>()

export function parseMessage(pattern: string): readonly Node[] {
  const cached = parsed.get(pattern)
  if (cached !== undefined) return cached

  const nodes = new Parser(pattern).parse()
  parsed.set(pattern, nodes)
  return nodes
}

export interface MessageContext {
  readonly locale: Locale
  readonly timeZone: string
}

export function formatMessage(pattern: string, args: MessageArgs, context: MessageContext): string {
  return render(parseMessage(pattern), args, context, null)
}

function render(
  nodes: readonly Node[],
  args: MessageArgs,
  context: MessageContext,
  hash: number | null,
): string {
  let out = ''

  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        out += node.value
        break
      case 'hash':
        out += hash === null ? '#' : numberFormat(context.locale, null).format(hash)
        break
      case 'value':
        out += stringify(args[node.name])
        break
      case 'number':
        out += numberFormat(context.locale, node.style).format(numeric(args[node.name]))
        break
      case 'date':
        out += dateFormat(context, node.style, 'date').format(temporal(args[node.name]))
        break
      case 'time':
        out += dateFormat(context, node.style, 'time').format(temporal(args[node.name]))
        break
      case 'select': {
        const branch =
          node.branches.get(stringify(args[node.name])) ?? node.branches.get('other') ?? []
        out += render(branch, args, context, hash)
        break
      }
      case 'plural': {
        const value = numeric(args[node.name])
        const shifted = value - node.offset
        const exact = node.branches.get(`=${value}`)
        const branch =
          exact ??
          node.branches.get(pluralCategory(context.locale, shifted, node.ordinal)) ??
          node.branches.get('other') ??
          []
        out += render(branch, args, context, shifted)
        break
      }
    }
  }

  return out
}

function stringify(value: MessageValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function numeric(value: MessageValue): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : 0
  }
  return 0
}

function temporal(value: MessageValue): Date {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return new Date(value)
  return new Date(0)
}

const numberFormats = new Map<string, Intl.NumberFormat>()

function numberFormat(locale: Locale, style: string | null): Intl.NumberFormat {
  const key = `${locale}${style ?? ''}`
  const cached = numberFormats.get(key)
  if (cached !== undefined) return cached

  const format = new Intl.NumberFormat(locale, numberOptions(style))
  numberFormats.set(key, format)
  return format
}

function numberOptions(style: string | null): Intl.NumberFormatOptions {
  if (style === 'integer') return { maximumFractionDigits: 0 }
  if (style === 'percent') return { style: 'percent' }
  if (style === 'compact') return { notation: 'compact' }
  if (style !== null && style.startsWith('::')) return skeletonOptions(style.slice(2))
  return {}
}

function skeletonOptions(skeleton: string): Intl.NumberFormatOptions {
  const options: Intl.NumberFormatOptions = {}

  for (const token of skeleton.split(/\s+/)) {
    if (token === 'percent') options.style = 'percent'
    else if (token === 'group-off') options.useGrouping = false
    else if (token.startsWith('currency/')) {
      options.style = 'currency'
      options.currency = token.slice('currency/'.length)
    } else if (/^\.0+$/.test(token)) {
      options.minimumFractionDigits = token.length - 1
      options.maximumFractionDigits = token.length - 1
    } else if (/^\.#+$/.test(token)) {
      options.maximumFractionDigits = token.length - 1
    }
  }

  return options
}

const dateFormats = new Map<string, Intl.DateTimeFormat>()

function dateFormat(
  context: MessageContext,
  style: string | null,
  kind: 'date' | 'time',
): Intl.DateTimeFormat {
  const key = `${context.locale}${context.timeZone}${kind}${style ?? ''}`
  const cached = dateFormats.get(key)
  if (cached !== undefined) return cached

  const width = style === null || style === '' ? 'medium' : style
  const options: Intl.DateTimeFormatOptions =
    kind === 'date'
      ? { dateStyle: dateStyle(width), timeZone: context.timeZone }
      : { timeStyle: dateStyle(width), timeZone: context.timeZone }

  const format = new Intl.DateTimeFormat(context.locale, options)
  dateFormats.set(key, format)
  return format
}

function dateStyle(width: string): 'full' | 'long' | 'medium' | 'short' {
  if (width === 'full' || width === 'long' || width === 'short') return width
  return 'medium'
}

const pluralRules = new Map<string, Intl.PluralRules>()

export function pluralCategory(locale: Locale, value: number, ordinal = false): string {
  const key = `${locale}${ordinal ? 'ordinal' : 'cardinal'}`
  let rules = pluralRules.get(key)

  if (rules === undefined) {
    rules = new Intl.PluralRules(locale, { type: ordinal ? 'ordinal' : 'cardinal' })
    pluralRules.set(key, rules)
  }

  return rules.select(value)
}

export function messagePlaceholders(pattern: string): ReadonlySet<string> {
  const names = new Set<string>()
  collect(parseMessage(pattern), names)
  return names
}

function collect(nodes: readonly Node[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.kind === 'text' || node.kind === 'hash') continue
    into.add(node.name)
    if (node.kind === 'plural' || node.kind === 'select') {
      for (const branch of node.branches.values()) collect(branch, into)
    }
  }
}
