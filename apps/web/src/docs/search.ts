/**
 * The search index, built once at build time.
 *
 * A documentation site this size does not need a search server, and paying for
 * one would mean the docs could go stale relative to the repository between
 * deploys. Every published document is cut at its headings, each piece gets a
 * snippet, and the whole thing ships as one static JSON file that the command
 * palette filters in the browser.
 *
 * The unit of a result is a *section*, not a document. "Connection pooling" is a
 * useful answer; "operating.md" is not.
 */

import { loadAllDocuments } from "./load"
import { findSection } from "./registry"

export interface SearchEntry {
  /** `/docs/operating#connection-pooling` — ready to navigate to. */
  readonly href: string
  readonly document: string
  readonly section: string
  readonly heading: string
  readonly depth: number
  readonly snippet: string
  /** Lower-cased heading and snippet, so the browser does not fold on every keystroke. */
  readonly haystack: string
}

export interface SearchIndex {
  readonly builtFrom: number
  readonly entries: readonly SearchEntry[]
}

/** Long enough to tell two similar sections apart, short enough to read in a list. */
const SNIPPET_LENGTH = 220

function snippet(text: string): string {
  if (text.length <= SNIPPET_LENGTH) return text
  const cut = text.slice(0, SNIPPET_LENGTH)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > SNIPPET_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export async function buildSearchIndex(): Promise<SearchIndex> {
  const documents = await loadAllDocuments()
  const entries: SearchEntry[] = []

  for (const { entry, rendered } of documents) {
    const sectionTitle = findSection(entry.section)?.title ?? entry.section

    for (const part of rendered.sections) {
      /*
       * `####` and deeper are indexed under the `###` above them rather than
       * given their own result. The generated references are full of fourth-level
       * headings — one per field of a view model — and a palette that offers
       * three hundred near-identical rows is a palette nobody scrolls.
       */
      if (part.depth > 3) continue
      if (part.text === "" && part.id !== "") continue

      const heading = part.id === "" ? entry.title : part.heading
      const text = snippet(part.text)

      entries.push({
        href: part.id === "" ? `/docs/${entry.slug}` : `/docs/${entry.slug}#${part.id}`,
        document: entry.title,
        section: sectionTitle,
        heading,
        depth: part.depth,
        snippet: text,
        haystack: `${entry.title} ${heading} ${part.text}`.toLowerCase(),
      })
    }
  }

  return { builtFrom: documents.length, entries }
}
