import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CodeCopyButtons } from '../../../src/components/code-copy'
import { MermaidDiagrams } from '../../../src/components/mermaid-diagrams'
import { TableOfContents } from '../../../src/components/table-of-contents'
import { site } from '../../../src/content/site'
import { loadDocument } from '../../../src/docs/load'
import { docHref, documents, findSection, neighbours } from '../../../src/docs/registry'
import { ogImage } from '../../../src/og/card'

export const dynamicParams = false

export function generateStaticParams() {
  return documents.map((doc) => ({ slug: doc.slug.split('/') }))
}

interface PageProps {
  readonly params: Promise<{ readonly slug: string[] }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const document = await loadDocument(slug.join('/'))
  if (!document) return {}

  return {
    title: document.entry.title,
    description: document.entry.blurb,
    alternates: { canonical: `/docs/${document.entry.slug}` },
    openGraph: {
      type: 'article',
      title: document.entry.title,
      description: document.entry.blurb,
      url: `/docs/${document.entry.slug}`,
      images: ogImage(`/docs/og/${document.entry.slug}`, document.entry.title),
    },
  }
}

export default async function DocumentPage({ params }: PageProps) {
  const { slug } = await params
  const document = await loadDocument(slug.join('/'))
  if (!document) notFound()

  const { entry, rendered, sourcePath } = document
  const section = findSection(entry.section)
  const { previous, next } = neighbours(entry.slug)
  const sourceUrl = `${site.repository}/blob/main/${sourcePath}`

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-12">
      <article className="min-w-0">
        <header className="border-b border-border pb-5">
          {section ? (
            <Link href={`/docs#${entry.section}`} className="eyebrow hover:text-fg">
              {section.title}
            </Link>
          ) : null}
          <h1 className="doc-title mt-2">{rendered.title ?? entry.title}</h1>
        </header>

        {rendered.headings.length > 0 ? (
          <details className="card mt-6 xl:hidden">
            <summary className="cursor-pointer px-4 py-3">On this page</summary>
            <ul className="flex flex-col gap-2 border-t border-border px-4 py-3">
              {rendered.headings
                .filter((heading) => heading.depth === 2)
                .map((heading) => (
                  <li key={heading.id}>
                    <a className="textlink" href={`#${heading.id}`}>
                      {heading.text}
                    </a>
                  </li>
                ))}
            </ul>
          </details>
        ) : null}

        <div className="doc-body mt-6" dangerouslySetInnerHTML={{ __html: rendered.html }} />
        <CodeCopyButtons />
        <MermaidDiagrams />

        <p className="mt-8 text-sm text-fg-muted">
          <a className="textlink" href={entry.generated ? '/docs/documentation' : sourceUrl}>
            {entry.generated ? 'Update this reference' : 'Edit this page'}
          </a>
        </p>

        <nav aria-label="Nearby documents" className="doc-nav">
          {previous ? (
            <Link href={docHref(previous.slug)} className="doc-nav-link doc-nav-prev">
              <span className="edition-label">← Previous</span>
              <span className="doc-nav-title">{previous.title}</span>
            </Link>
          ) : (
            <span aria-hidden className="doc-nav-ghost" />
          )}
          {next ? (
            <Link href={docHref(next.slug)} className="doc-nav-link doc-nav-next">
              <span className="edition-label">Next →</span>
              <span className="doc-nav-title">{next.title}</span>
            </Link>
          ) : (
            <span aria-hidden className="doc-nav-ghost" />
          )}
        </nav>
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pb-8">
          <TableOfContents headings={rendered.headings} />
        </div>
      </aside>
    </div>
  )
}
