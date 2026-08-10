import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { CodeCopyButtons } from "../../../src/components/code-copy"
import { MermaidDiagrams } from "../../../src/components/mermaid-diagrams"
import { TableOfContents } from "../../../src/components/table-of-contents"
import { site } from "../../../src/content/site"
import { loadDocument } from "../../../src/docs/load"
import { docHref, documents, findSection, neighbours } from "../../../src/docs/registry"

export const dynamicParams = false

export function generateStaticParams() {
  return documents.map((doc) => ({ slug: doc.slug.split("/") }))
}

interface PageProps {
  readonly params: Promise<{ readonly slug: string[] }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const document = await loadDocument(slug.join("/"))
  if (!document) return {}

  return {
    title: document.entry.title,
    description: document.entry.blurb,
    alternates: { canonical: `/docs/${document.entry.slug}` },
    openGraph: {
      type: "article",
      title: document.entry.title,
      description: document.entry.blurb,
      url: `/docs/${document.entry.slug}`,
    },
  }
}

export default async function DocumentPage({ params }: PageProps) {
  const { slug } = await params
  const document = await loadDocument(slug.join("/"))
  if (!document) notFound()

  const { entry, rendered, sourcePath } = document
  const section = findSection(entry.section)
  const { previous, next } = neighbours(entry.slug)
  const sourceUrl = `${site.repository}/blob/main/${sourcePath}`

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-12">
      <article className="min-w-0">
        <header className="border-b border-border pb-8">
          {section ? (
            <Link href={`/docs#${entry.section}`} className="eyebrow hover:text-fg">
              {section.title}
            </Link>
          ) : null}
          <h1 className="display mt-2 text-huge leading-[1.06]">
            {rendered.title ?? entry.title}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-micro text-fg-subtle">
            <a className="textlink" href={sourceUrl}>
              {sourcePath}
            </a>
            {entry.generated ? (
              <span className="chip">generated from the code</span>
            ) : null}
          </div>
        </header>

        <div
          className="doc-body mt-10"
          dangerouslySetInnerHTML={{ __html: rendered.html }}
        />
        <CodeCopyButtons />
        <MermaidDiagrams />

        <nav
          aria-label="Nearby documents"
          className="card-grid mt-16 sm:grid-cols-2"
        >
          {previous ? (
            <Link href={docHref(previous.slug)}>
              <span className="eyebrow">Previous</span>
              <span className="font-medium text-fg">{previous.title}</span>
            </Link>
          ) : (
            <span aria-hidden className="card-ghost hidden sm:block" />
          )}
          {next ? (
            <Link href={docHref(next.slug)} className="sm:items-end sm:text-right">
              <span className="eyebrow">Next</span>
              <span className="font-medium text-fg">{next.title}</span>
            </Link>
          ) : (
            <span aria-hidden className="card-ghost hidden sm:block" />
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
