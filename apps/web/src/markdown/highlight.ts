import { createHighlighter, type Highlighter } from "shiki"

const LANGUAGES = [
  "bash",
  "diff",
  "http",
  "ini",
  "json",
  "sql",
  "tsx",
  "typescript",
  "yaml",
] as const

const ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  console: "bash",
  ts: "typescript",
  js: "typescript",
  javascript: "typescript",
  jsx: "tsx",
  env: "ini",
  yml: "yaml",
}

let highlighter: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: ["vitesse-light", "vitesse-dark"],
    langs: [...LANGUAGES],
  })
  return highlighter
}

export interface HighlightedCode {
  readonly html: string
  readonly language: string | null
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)
}

export async function highlight(code: string, lang: string | undefined): Promise<HighlightedCode> {
  const requested = (lang ?? "").trim().toLowerCase()
  const resolved = ALIASES[requested] ?? requested

  if (resolved === "" || !LANGUAGES.includes(resolved as (typeof LANGUAGES)[number])) {
    return { html: escapeHtml(code), language: null }
  }

  const shiki = await getHighlighter()
  const html = shiki.codeToHtml(code, {
    lang: resolved,
    themes: { light: "vitesse-light", dark: "vitesse-dark" },
    defaultColor: false,
    structure: "inline",
  })

  return { html, language: requested }
}
