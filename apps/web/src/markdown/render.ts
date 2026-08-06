import { lexer, parser, Renderer, type Token, type Tokens } from "marked"

import { highlight, type HighlightedCode } from "./highlight"
import { createSlugger } from "./slug"

export interface DocHeading {
  readonly id: string
  readonly text: string
  readonly depth: number
}

export interface ResolvedLink {
  readonly href: string
  readonly external: boolean
}

export interface RenderOptions {
  readonly resolveLink: (href: string) => ResolvedLink
}

export interface DocSectionText {
  readonly id: string
  readonly heading: string
  readonly depth: number
  readonly text: string
}

export interface RenderedMarkdown {
  readonly title: string | null
  readonly html: string
  readonly headings: readonly DocHeading[]
  readonly sections: readonly DocSectionText[]
  readonly text: string
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)
}

export function tokensToText(tokens: readonly Token[] | undefined): string {
  if (!tokens) return ""

  let out = ""
  for (const token of tokens) {
    switch (token.type) {
      case "code":
      case "codespan":
      case "text":
      case "escape":
        out += "tokens" in token && Array.isArray(token.tokens) ? tokensToText(token.tokens) : (token.text ?? "")
        break
      case "br":
        out += " "
        break
      case "space":
        out += " "
        break
      case "image":
        out += token.text ?? ""
        break
      default: {
        const nested = "tokens" in token ? (token.tokens as Token[] | undefined) : undefined
        if (nested) out += tokensToText(nested)
        else if ("text" in token && typeof token.text === "string") out += token.text
      }
    }
  }
  return out
}

function blockText(tokens: readonly Token[] | undefined, out: string[] = []): string[] {
  if (!tokens) return out

  for (const token of tokens) {
    switch (token.type) {
      case "code":
      case "space":
      case "hr":
      case "html":
        break
      case "list":
        for (const item of (token as Tokens.List).items) blockText(item.tokens, out)
        break
      case "table": {
        const table = token as Tokens.Table
        for (const cell of table.header) out.push(tokensToText(cell.tokens))
        for (const row of table.rows) for (const cell of row) out.push(tokensToText(cell.tokens))
        break
      }
      case "blockquote":
        blockText((token as Tokens.Blockquote).tokens, out)
        break
      default: {
        const text = tokensToText("tokens" in token ? (token.tokens as Token[]) : [token])
        if (text.trim() !== "") out.push(text.trim())
      }
    }
  }
  return out
}

const LANGUAGE_LABELS: Record<string, string> = {
  sh: "shell",
  bash: "shell",
  console: "shell",
  ts: "TypeScript",
  tsx: "TypeScript",
  typescript: "TypeScript",
  js: "JavaScript",
  json: "JSON",
  sql: "SQL",
  http: "HTTP",
  env: "env",
  text: "",
  "": "",
}

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/

const ALERT_LABELS: Record<string, string> = {
  NOTE: "Note",
  TIP: "Tip",
  IMPORTANT: "Important",
  WARNING: "Warning",
  CAUTION: "Caution",
}

class DocRenderer extends Renderer {
  constructor(
    private readonly headingIds: WeakMap<Tokens.Heading, string>,
    private readonly codeBlocks: WeakMap<Tokens.Code, HighlightedCode>,
    private readonly alerts: WeakMap<Tokens.Blockquote, string>,
    private readonly resolveLink: RenderOptions["resolveLink"],
  ) {
    super()
  }

  override blockquote(token: Tokens.Blockquote): string {
    const kind = this.alerts.get(token)
    if (kind === undefined) return super.blockquote(token)

    const label = ALERT_LABELS[kind] ?? kind
    return (
      `<aside class="doc-callout" data-kind="${kind.toLowerCase()}">` +
      `<p class="doc-callout-label">${escapeHtml(label)}</p>` +
      `<div class="doc-callout-body">${this.parser.parse(token.tokens)}</div>` +
      `</aside>\n`
    )
  }

  override heading(token: Tokens.Heading): string {
    const id = this.headingIds.get(token) ?? ""
    const depth = Math.min(6, token.depth)
    const content = this.parser.parseInline(token.tokens)

    return (
      `<h${depth} id="${escapeHtml(id)}" class="doc-heading">` +
      `<a class="doc-heading-anchor" href="#${escapeHtml(id)}">${content}</a>` +
      `</h${depth}>\n`
    )
  }

  override link({ href, title, tokens }: Tokens.Link): string {
    const resolved = this.resolveLink(href)
    const text = this.parser.parseInline(tokens)
    const attributes = [
      `href="${escapeHtml(resolved.href)}"`,
      title ? `title="${escapeHtml(title)}"` : "",
      resolved.external ? 'target="_blank" rel="noreferrer"' : "",
      resolved.external ? 'class="doc-link doc-link-external"' : 'class="doc-link"',
    ].filter(Boolean)

    return `<a ${attributes.join(" ")}>${text}</a>`
  }

  override image({ href, title, text }: Tokens.Image): string {
    const resolved = this.resolveLink(href)
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : ""
    return `<img src="${escapeHtml(resolved.href)}" alt="${escapeHtml(text)}"${titleAttribute} loading="lazy" />`
  }

  override code(token: Tokens.Code): string {
    const language = (token.lang ?? "").trim().split(/\s+/)[0] ?? ""
    const label = LANGUAGE_LABELS[language.toLowerCase()] ?? language
    const highlighted = this.codeBlocks.get(token)

    return (
      `<figure class="doc-code"${label === "" ? "" : ` data-lang="${escapeHtml(label)}"`}>` +
      `<pre data-code="${escapeHtml(token.text)}"><code>` +
      (highlighted ? highlighted.html : escapeHtml(token.text)) +
      `</code></pre></figure>\n`
    )
  }

  override table(token: Tokens.Table): string {
    return `<div class="doc-table" role="region" tabindex="0">${super.table(token)}</div>\n`
  }

  override html({ text }: Tokens.HTML | Tokens.Tag): string {
    if (/^\s*<!--/.test(text)) return ""
    return escapeHtml(text)
  }
}

function collectHeadings(tokens: readonly Token[]): {
  headings: DocHeading[]
  ids: WeakMap<Tokens.Heading, string>
} {
  const slugger = createSlugger()
  const headings: DocHeading[] = []
  const ids = new WeakMap<Tokens.Heading, string>()

  for (const token of tokens) {
    if (token.type !== "heading") continue
    const heading = token as Tokens.Heading
    const text = tokensToText(heading.tokens).trim()
    const id = slugger(text)
    ids.set(heading, id)
    if (heading.depth >= 2 && heading.depth <= 3) headings.push({ id, text, depth: heading.depth })
  }

  return { headings, ids }
}

function* everyToken(tokens: readonly Token[] | undefined): Generator<Token> {
  if (!tokens) return

  for (const token of tokens) {
    if (!token || typeof token !== "object") continue
    yield token
    yield* everyToken((token as Tokens.Generic).tokens)
    yield* everyToken((token as Tokens.List).items)

    const table = token as Tokens.Table
    if (Array.isArray(table.header)) for (const cell of table.header) yield* everyToken(cell.tokens)
    if (Array.isArray(table.rows)) {
      for (const row of table.rows) for (const cell of row) yield* everyToken(cell.tokens)
    }
  }
}

function stripAlertMarker(tokens: readonly Token[] | undefined): boolean {
  for (const token of tokens ?? []) {
    const generic = token as Tokens.Generic
    if (typeof generic.text === "string" && ALERT_MARKER.test(generic.text)) {
      generic.text = generic.text.replace(ALERT_MARKER, "")
      if (typeof generic.raw === "string") generic.raw = generic.raw.replace(ALERT_MARKER, "")
      stripAlertMarker(generic.tokens)
      return true
    }
    if (generic.tokens && stripAlertMarker(generic.tokens)) return true
  }
  return false
}

async function prepare(tokens: readonly Token[]): Promise<{
  codeBlocks: WeakMap<Tokens.Code, HighlightedCode>
  alerts: WeakMap<Tokens.Blockquote, string>
}> {
  const codeBlocks = new WeakMap<Tokens.Code, HighlightedCode>()
  const alerts = new WeakMap<Tokens.Blockquote, string>()
  const pending: Promise<void>[] = []

  for (const token of everyToken(tokens)) {
    if (token.type === "code") {
      const code = token as Tokens.Code
      pending.push(
        highlight(code.text, code.lang).then((result) => {
          codeBlocks.set(code, result)
        }),
      )
      continue
    }

    if (token.type === "blockquote") {
      const quote = token as Tokens.Blockquote
      const marker = ALERT_MARKER.exec(quote.text)
      if (!marker?.[1]) continue
      alerts.set(quote, marker[1])
      stripAlertMarker(quote.tokens)
    }
  }

  await Promise.all(pending)
  return { codeBlocks, alerts }
}

export async function renderMarkdown(
  markdown: string,
  options: RenderOptions,
): Promise<RenderedMarkdown> {
  const tokens = lexer(markdown, { gfm: true })

  let title: string | null = null
  const body = [...tokens]
  const first = body.find((token) => token.type !== "space")
  if (first?.type === "heading" && (first as Tokens.Heading).depth === 1) {
    title = tokensToText((first as Tokens.Heading).tokens).trim()
    body.splice(body.indexOf(first), 1)
  }

  const { codeBlocks, alerts } = await prepare(body)
  const { headings, ids } = collectHeadings(body)
  const sections = splitAtHeadings(body, ids, title ?? "")
  const renderer = new DocRenderer(ids, codeBlocks, alerts, options.resolveLink)

  return {
    title,
    html: parser(body, { gfm: true, renderer }),
    headings,
    sections,
    text: sections.map((section) => section.text).join("\n"),
  }
}

function splitAtHeadings(
  tokens: readonly Token[],
  ids: WeakMap<Tokens.Heading, string>,
  documentTitle: string,
): DocSectionText[] {
  const sections: DocSectionText[] = []
  let current: { id: string; heading: string; depth: number; body: Token[] } = {
    id: "",
    heading: documentTitle,
    depth: 1,
    body: [],
  }

  const flush = () => {
    const text = blockText(current.body).join(" ").replace(/\s+/g, " ").trim()
    if (text !== "" || current.id !== "") {
      sections.push({ id: current.id, heading: current.heading, depth: current.depth, text })
    }
  }

  for (const token of tokens) {
    if (token.type === "heading") {
      const heading = token as Tokens.Heading
      flush()
      current = {
        id: ids.get(heading) ?? "",
        heading: tokensToText(heading.tokens).trim(),
        depth: heading.depth,
        body: [],
      }
      continue
    }
    current.body.push(token)
  }
  flush()

  return sections
}
