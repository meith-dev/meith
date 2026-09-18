import { describe, expect, it } from 'vitest'

import { site } from '../content/site'
import { linkResolver, loadAllDocuments } from './load'
import {
  documents,
  internalDocuments,
  neighbours,
  quickstartHref,
  readingOrder,
  sections,
} from './registry'

describe('linkResolver', () => {
  const fromDocs = linkResolver('operations/operating.md')
  const fromNested = linkResolver('notes/example.md')

  it('keeps an anchor within the page', () => {
    expect(fromDocs('#connection-pooling')).toEqual({
      href: '#connection-pooling',
      external: false,
    })
  })

  it('sends a published document to its page, anchor and all', () => {
    expect(fromDocs('../extensions/themes.md')).toEqual({
      href: '/docs/themes',
      external: false,
    })
    expect(fromDocs('../extensions/plugins.md#failure')).toEqual({
      href: '/docs/plugins#failure',
      external: false,
    })
  })

  it('resolves relative to the document doing the linking', () => {
    expect(fromNested('../operations/operating.md')).toEqual({
      href: '/docs/operating',
      external: false,
    })
    expect(fromNested('./sibling.md')).toEqual({
      href: `${site.repository}/blob/main/docs/notes/sibling.md`,
      external: true,
    })
  })

  it("sends the documentation index to this site's own index", () => {
    expect(fromDocs('../README.md')).toEqual({ href: '/docs', external: false })
  })

  it('sends a link that climbs out of docs/ to the repository root', () => {
    expect(fromDocs('../../docker/compose.yml')).toEqual({
      href: `${site.repository}/blob/main/docker/compose.yml`,
      external: true,
    })
    expect(fromDocs('../../.env.example')).toEqual({
      href: `${site.repository}/blob/main/.env.example`,
      external: true,
    })
  })

  it('sends an unpublished document to the repository rather than to a 404', () => {
    expect(fromDocs('./internal-notes.md')).toEqual({
      href: `${site.repository}/blob/main/docs/operations/internal-notes.md`,
      external: true,
    })
    expect(fromDocs('./notes')).toEqual({
      href: `${site.repository}/tree/main/docs/operations/notes`,
      external: true,
    })
  })

  it('leaves an absolute URL alone and marks it external', () => {
    expect(fromDocs('https://vercel.com')).toEqual({
      href: 'https://vercel.com',
      external: true,
    })
    expect(fromDocs('mailto:hello@meith.dev')).toEqual({
      href: 'mailto:hello@meith.dev',
      external: true,
    })
  })
})

describe('the published set', () => {
  it('keeps the local-preview call to action pointing to the quickstart after regrouping', () => {
    expect(quickstartHref()).toBe('/docs/quickstart')
  })

  it('renders every document in the manifest', async () => {
    const loaded = await loadAllDocuments()

    expect(loaded).toHaveLength(documents.length)
    for (const document of loaded) {
      expect(document.rendered.html.length).toBeGreaterThan(0)
      expect(document.rendered.title).not.toBeNull()
    }
  })

  it('puts every document in the reading order exactly once', () => {
    expect(readingOrder).toHaveLength(documents.length)
    expect(new Set(readingOrder.map((doc) => doc.slug)).size).toBe(documents.length)
  })

  it('never publishes a document marked internal', () => {
    const hiddenFiles = new Set(internalDocuments.map((doc) => doc.file))
    for (const document of documents) {
      expect(hiddenFiles.has(document.file)).toBe(false)
    }
  })

  it('keeps previous and next within the reader section', () => {
    for (const section of sections) {
      const entries = readingOrder.filter((entry) => entry.section === section.id)
      const first = entries[0]
      const last = entries.at(-1)
      if (first) expect(neighbours(first.slug).previous).toBeUndefined()
      if (last) expect(neighbours(last.slug).next).toBeUndefined()
    }
    expect(neighbours('missing-document')).toEqual({ previous: undefined, next: undefined })
  })
})
