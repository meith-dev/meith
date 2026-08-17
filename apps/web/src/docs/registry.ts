import manifest from '../../content/docs.manifest.json'

export interface DocSection {
  readonly id: string
  readonly title: string
  readonly blurb: string
}

export interface DocEntry {
  readonly slug: string
  readonly file: string
  readonly section: string
  readonly title: string
  readonly blurb: string
  readonly generated: boolean
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

export function documentsInSection(sectionId: string): readonly DocEntry[] {
  return documents.filter((doc) => doc.section === sectionId)
}

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

export function docHref(slug: string, anchor?: string): string {
  return anchor ? `/docs/${slug}#${anchor}` : `/docs/${slug}`
}

/*
 * Where "set one up" points. Every marketing page and the header need it, and
 * working it out from the manifest in five places is five places to be wrong
 * if the running section is ever renamed.
 */
export function quickstartHref(): string {
  const running = findSection('running')
  const quickstart = running ? documentsInSection(running.id).find((doc) => doc.primary) : undefined
  return quickstart ? docHref(quickstart.slug) : '/docs'
}
