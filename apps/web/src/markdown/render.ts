/**
 * Markdown → HTML, for documents this repository owns.
 *
 * The whole point of this app is that `docs/*.md` stays the single editable
 * copy of the documentation, so this module's job is to render those files
 * faithfully rather than to be a general-purpose Markdown host. Three
 * consequences follow, and each is a deliberate narrowing:
 *
 * 1. **Raw HTML is escaped, not emitted.** The documents are plain Markdown;
 *    the only HTML in them is the `GENERATED FILE — do not edit` comment at the
 *    top of the four generated references, and two places where a literal
 *    `<form>` / `<title>` is being *talked about*. Passing those through would
 *    render them invisible; escaping shows the reader what the author wrote.
 *    It also means no future edit to a document can inject markup into a page.
 * 2. **Generator comments are dropped.** They are instructions to whoever opens
 *    the file, not to whoever reads the page. The page says a document is
 *    generated in its own header instead, from the manifest.
 * 3. **Links are resolved by the caller.** A relative `./operating.md` has to
 *    become `/docs/operating` here and a GitHub URL when it points at something
 *    the site does not publish — and only the docs layer knows which is which.
 */

import { lexer, parser, Renderer, type Token, type Tokens } from "marked"

import { createSlugger } from "./slug"

export interface DocHeading {
  readonly id: string
  readonly text: string
  /** 2 for `##`, 3 for `###`. The `#` title is lifted out before rendering. */
  readonly depth: number
}

/** Where a link should point, once the docs layer has had a look at it. */
export interface ResolvedLink {
  readonly href: string
  /** External links get `rel="noreferrer"` and open in a new tab. */
  readonly external: boolean
}

export interface RenderOptions {
  /** Called for every link in the document, including image sources. */
  readonly resolveLink: (href: string) => ResolvedLink
}

/**
 * One heading and the prose beneath it, markup removed.
 *
 * The unit the search index works in. A whole document is too coarse to be a
 * useful result — `operating.md` is four hundred lines and "which line" is the
 * entire question — and a paragraph is too fine to name in a result list.
 */
export interface DocSectionText {
  /** The anchor to link at. Empty for the prose above the first heading. */
  readonly id: string
  readonly heading: string
  readonly depth: number
  readonly text: string
}

export interface RenderedMarkdown {
  /** The document's `# ` title, if it opened with one. */
  readonly title: string | null
  readonly html: string
  /** `##` and `###` headings, in document order, for the contents rail. */
  readonly headings: readonly DocHeading[]
  /** The same document split at its headings, for the search index. */
  readonly sections: readonly DocSectionText[]
  /** Prose with the markup taken off. */
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

/**
 * The visible text of an inline token run.
 *
 * Used for heading slugs and for the search index, so it must agree with what a
 * reader sees: a `` `Shell` `` heading is the word Shell, not a backtick.
 */
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

/** Prose only: block structure flattened, fenced code left out. */
function blockText(tokens: readonly Token[] | undefined, out: string[] = []): string[] {
  if (!tokens) return out

  for (const token of tokens) {
    switch (token.type) {
      /* Fenced code is noise in a search index and dwarfs the prose around it. */
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

/**
 * A fence's language, as a label a reader recognises. Unknown languages fall
 * through unchanged rather than being hidden — an unfamiliar label is
 * information, and a missing one is not.
 */
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

class DocRenderer extends Renderer {
  constructor(
    private readonly headingIds: WeakMap<Tokens.Heading, string>,
    private readonly resolveLink: RenderOptions["resolveLink"],
  ) {
    super()
  }

  override heading(token: Tokens.Heading): string {
    const id = this.headingIds.get(token) ?? ""
    const depth = Math.min(6, token.depth)
    const content = this.parser.parseInline(token.tokens)

    /*
     * The whole heading is the anchor, not a `¶` bolted onto the end. A reader
     * copying a link to a section aims at the words, and a one-character target
     * is a miss on a touchscreen.
     */
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

  override code({ text, lang }: Tokens.Code): string {
    const language = (lang ?? "").trim().split(/\s+/)[0] ?? ""
    const label = LANGUAGE_LABELS[language.toLowerCase()] ?? language
    const caption = label === "" ? "" : `<figcaption class="doc-code-label">${escapeHtml(label)}</figcaption>`

    return (
      `<figure class="doc-code">${caption}` +
      `<pre><code>${escapeHtml(text)}</code></pre>` +
      `</figure>\n`
    )
  }

  /*
   * A wrapper that can scroll on its own, because several of these tables are
   * genuinely wide — `theme-slots.md` has a five-column table whose last column
   * is a TypeScript type. Without it the *page* scrolls sideways on a phone,
   * which breaks every other line of prose on it.
   */
  override table(token: Tokens.Table): string {
    return `<div class="doc-table" role="region" tabindex="0">${super.table(token)}</div>\n`
  }

  /** See the module header: comments vanish, everything else is shown as written. */
  override html({ text }: Tokens.HTML | Tokens.Tag): string {
    if (/^\s*<!--/.test(text)) return ""
    return escapeHtml(text)
  }
}

/**
 * Assign an id to every `##`/`###` heading before rendering, so the contents
 * rail and the rendered anchors cannot disagree.
 *
 * Doing it in one pass over the token tree — rather than slugging again inside
 * the renderer — is what makes duplicate numbering safe: two `### Notes`
 * headings become `notes` and `notes-1` in both places because there is only
 * one slugger and one traversal.
 */
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

export function renderMarkdown(markdown: string, options: RenderOptions): RenderedMarkdown {
  const tokens = lexer(markdown, { gfm: true })

  /*
   * The `# ` title is lifted out and rendered by the page, beside the audience
   * and the "generated" mark. Leaving it in the body would put two competing
   * titles on the page, and the manifest's title is the one the navigation,
   * the search results and the `<title>` element already agree on.
   */
  let title: string | null = null
  const body = [...tokens]
  const first = body.find((token) => token.type !== "space")
  if (first?.type === "heading" && (first as Tokens.Heading).depth === 1) {
    title = tokensToText((first as Tokens.Heading).tokens).trim()
    body.splice(body.indexOf(first), 1)
  }

  const { headings, ids } = collectHeadings(body)
  const sections = splitAtHeadings(body, ids, title ?? "")

  return {
    title,
    html: parser(body, { gfm: true, renderer: new DocRenderer(ids, options.resolveLink) }),
    headings,
    sections,
    text: sections.map((section) => section.text).join("\n"),
  }
}

/**
 * The document again, cut at every heading.
 *
 * Shares the `ids` map with the renderer rather than slugging a second time, so
 * a search result can never link at an anchor the page does not have — which is
 * exactly what a second, independently-numbered slugger would eventually do to a
 * document with two headings of the same name.
 */
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
