/**
 * The documentation set, as data.
 *
 * `content/docs.manifest.json` is the one file that says which documents exist,
 * what they are called and where they belong. Everything downstream — the docs
 * index, the sidebar, the previous/next links, the sitemap, the search index and
 * the link rewriter — reads it from here, so a new document is added by writing
 * it into `docs/` and naming it in the manifest, and in no other place.
 *
 * The prose is never duplicated: an entry is a *pointer* at a file under `docs/`
 * at the workspace root, which stays the single editable copy for both this site
 * and anyone reading the repository.
 */

import manifest from "../../content/docs.manifest.json"

export interface DocSection {
  readonly id: string
  readonly title: string
  readonly blurb: string
}

export interface DocEntry {
  /** URL path under `/docs/`. `adr/0001-…` for the nested ones. */
  readonly slug: string
  /** Path relative to `docs/` at the workspace root. */
  readonly file: string
  readonly section: string
  readonly title: string
  readonly blurb: string
  /** Written by a script from the code. The page says so, and says which script. */
  readonly generated: boolean
  /** The document to send someone to first within its section. */
  readonly primary: boolean
}

export interface InternalDoc {
  readonly file: string
  readonly reason: string
}

export const sections: readonly DocSection[] = manifest.sections
export const documents: readonly DocEntry[] = manifest.documents
export const internalDocuments: readonly InternalDoc[] = manifest.internal

const bySlug = new Map(documents.map((doc) => [doc.slug, doc]))
const byFile = new Map(documents.map((doc) => [doc.file, doc]))
const internalByFile = new Map(internalDocuments.map((doc) => [doc.file, doc]))

export function findDocument(slug: string): DocEntry | undefined {
  return bySlug.get(slug)
}

export function findDocumentByFile(file: string): DocEntry | undefined {
  return byFile.get(file)
}

export function isInternalFile(file: string): boolean {
  return internalByFile.has(file)
}

/** Every document in one section, manifest order preserved. */
export function documentsInSection(sectionId: string): readonly DocEntry[] {
  return documents.filter((doc) => doc.section === sectionId)
}

/**
 * Reading order: sections in manifest order, documents in manifest order within
 * each. Used for the previous/next pair at the foot of a page, which is the only
 * navigation a reader working straight through the operator handbook wants.
 */
export const readingOrder: readonly DocEntry[] = sections.flatMap((section) =>
  documentsInSection(section.id),
)

export function neighbours(slug: string): {
  previous: DocEntry | undefined
  next: DocEntry | undefined
} {
  const index = readingOrder.findIndex((doc) => doc.slug === slug)
  if (index === -1) return { previous: undefined, next: undefined }
  return { previous: readingOrder[index - 1], next: readingOrder[index + 1] }
}

export function findSection(id: string): DocSection | undefined {
  return sections.find((section) => section.id === id)
}

/** `/docs/operating`, and `/docs/operating#permissions` when an anchor is given. */
export function docHref(slug: string, anchor?: string): string {
  return anchor ? `/docs/${slug}#${anchor}` : `/docs/${slug}`
}
