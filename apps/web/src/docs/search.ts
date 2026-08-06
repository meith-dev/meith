import { loadAllDocuments } from "./load"
import { findSection } from "./registry"

export interface SearchEntry {
  readonly href: string
  readonly document: string
  readonly section: string
  readonly heading: string
  readonly depth: number
  readonly snippet: string
  readonly haystack: string
}

export interface SearchIndex {
  readonly builtFrom: number
  readonly entries: readonly SearchEntry[]
}

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
