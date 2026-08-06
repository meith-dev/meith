import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { CodeCopyButtons } from "../../../src/components/code-copy"
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
        <header className="border-b border-wall pb-8">
          {section ? (
            <Link href={`/docs#${entry.section}`} className="eyebrow hover:text-gorse">
              {section.title}
            </Link>
          ) : null}
          <h1 className="display mt-2 text-huge leading-[1.04]">
            {rendered.title ?? entry.title}
          </h1>

          { }
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-micro text-ink-faint">
            <a className="textlink" href={sourceUrl}>
              {sourcePath}
            </a>
            {entry.generated ? (
              <span className="border border-wall px-2 py-0.5 tracking-[0.1em] uppercase">
                generated from the code
              </span>
            ) : null}
          </div>
        </header>

        { }
        <div
          className="doc-body mt-10"
          dangerouslySetInnerHTML={{ __html: rendered.html }}
        />
        <CodeCopyButtons />

        <nav
          aria-label="Nearby documents"
          className="mt-16 grid gap-px border border-wall bg-wall sm:grid-cols-2"
        >
          {previous ? (
            <Link href={docHref(previous.slug)} className="flex flex-col gap-1 bg-ground p-5">
              <span className="eyebrow">Previous</span>
              <span className="text-ink transition-colors hover:text-gorse">{previous.title}</span>
            </Link>
          ) : (
            <span className="bg-ground p-5" />
          )}
          {next ? (
            <Link
              href={docHref(next.slug)}
              className="flex flex-col gap-1 bg-ground p-5 sm:items-end sm:text-right"
            >
              <span className="eyebrow">Next</span>
              <span className="text-ink transition-colors hover:text-gorse">{next.title}</span>
            </Link>
          ) : (
            <span className="bg-ground p-5" />
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
