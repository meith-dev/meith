import { readFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'

import { cache } from 'react'

import { site } from '../content/site'
import { type RenderedMarkdown, type ResolvedLink, renderMarkdown } from '../markdown/render'
import { DOCS_DIRECTORY } from '../workspace'
import {
  type DocEntry,
  documents,
  findDocument,
  findDocumentByFile,
  isInternalFile,
} from './registry'

function repositoryHref(pathFromRoot: string, anchor: string): string {
  return `${site.repository}/blob/main/${pathFromRoot}${anchor}`
}

export function linkResolver(file: string): (href: string) => ResolvedLink {
  const directory = dirname(file)

  return (href: string): ResolvedLink => {
    if (href.startsWith('#')) return { href, external: false }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
      return { href, external: true }
    }

    const [rawPath = '', rawAnchor] = href.split('#')
    const anchor = rawAnchor === undefined ? '' : `#${rawAnchor}`
    const target = normalize(directory === '.' ? rawPath : join(directory, rawPath))

    if (target.startsWith('../')) {
      return { href: repositoryHref(target.replace(/^(\.\.\/)+/, ''), anchor), external: true }
    }

    if (target === 'README.md') return { href: `/docs${anchor}`, external: false }

    const published = findDocumentByFile(target)
    if (published) return { href: `/docs/${published.slug}${anchor}`, external: false }

    if (isInternalFile(target) || target.endsWith('.md')) {
      return { href: repositoryHref(`docs/${target}`, anchor), external: true }
    }

    return { href: `${site.repository}/tree/main/docs/${target}${anchor}`, external: true }
  }
}

export interface LoadedDocument {
  readonly entry: DocEntry
  readonly rendered: RenderedMarkdown
  readonly sourcePath: string
}

export const loadDocument = cache(async (slug: string): Promise<LoadedDocument | null> => {
  const entry = findDocument(slug)
  if (!entry) return null

  const absolute = join(DOCS_DIRECTORY, entry.file)
  const markdown = await readFile(absolute, 'utf8')

  return {
    entry,
    rendered: await renderMarkdown(markdown, { resolveLink: linkResolver(entry.file) }),
    sourcePath: `docs/${entry.file}`,
  }
})

export const loadAllDocuments = cache(async (): Promise<readonly LoadedDocument[]> => {
  const loaded = await Promise.all(documents.map((doc) => loadDocument(doc.slug)))
  return loaded.filter((doc): doc is LoadedDocument => doc !== null)
})

export const readDocumentSource = cache(async (slug: string): Promise<string | null> => {
  const entry = findDocument(slug)
  if (!entry) return null
  return readFile(join(DOCS_DIRECTORY, entry.file), 'utf8')
})
