/**
 * Syntax highlighting, at build time only.
 *
 * Shiki runs the real TextMate grammars, which is why the output is worth
 * having — a regex highlighter gets shell transcripts and TypeScript generics
 * subtly wrong, and subtly wrong highlighting is worse than none because the
 * reader trusts it. It is also the reason it happens here rather than in the
 * browser: the grammars are large, and none of them needs to ship, since every
 * page on this site is prerendered.
 *
 * Both schemes are emitted at once. With `defaultColor: false`, each token
 * carries `--shiki-light` and `--shiki-dark` custom properties and the
 * stylesheet decides which one applies — so the colour scheme can be switched
 * without re-highlighting, and the choice honours the same `data-theme`
 * attribute as everything else on the page.
 */

import { createHighlighter, type Highlighter } from "shiki"

/**
 * The languages the documentation actually uses, plus the few a future document
 * plausibly will. Loading the full set would add seconds to every build for
 * grammars nothing references; an unlisted language falls back to plain text,
 * which is a missing colour rather than a broken page.
 */
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

/** Aliases the documents write, mapped onto a grammar that is loaded. */
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

/*
 * One highlighter for the whole build. Creating it loads every grammar above,
 * so doing it per code block would repeat that work a few hundred times.
 */
let highlighter: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: ["vitesse-light", "vitesse-dark"],
    langs: [...LANGUAGES],
  })
  return highlighter
}

export interface HighlightedCode {
  /** `<span>`-wrapped lines, ready to go inside a `<pre><code>`. */
  readonly html: string
  /** The language actually used, or `null` when the block was left plain. */
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
    /*
     * No default colour: the stylesheet picks between the two custom properties.
     * With a default, one scheme is baked into the `color` declaration and the
     * other only applies under a media query — which the site's explicit
     * light/dark toggle then cannot override.
     */
    defaultColor: false,
    structure: "inline",
  })

  return { html, language: requested }
}
