import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { CodeCopyButtons } from "../../../src/components/code-copy"
import { MermaidDiagrams } from "../../../src/components/mermaid-diagrams"
import { TableOfContents } from "../../../src/components/table-of-contents"
import { site } from "../../../src/content/site"
import { loadDocument } from "../../../src/docs/load"
import { docHref, documents, findSection, neighbours } from "../../../src/docs/registry"

/**
 * One document, rendered from its Markdown at build time.
 *
 * `dynamicParams = false` because the set of documents is the manifest and
 * nothing else: a slug that is not in it is a mistake, and 404ing at build time
 * is better than rendering an empty page for it at request time.
 */
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

          {/*
            The manifest's blurb is deliberately *not* rendered here. Every
            document opens with its own lead paragraph — it has to, because it is
            read on GitHub as well — so printing the blurb above it said the same
            thing twice in slightly different words, which reads as an editing
            mistake. The blurb earns its keep in the listings, the search results
            and the page description, where the document's own text is not there
            to do the job.
          */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-micro text-fg-subtle">
            <a className="textlink" href={sourceUrl}>
              {sourcePath}
            </a>
            {entry.generated ? (
              /*
                The generated references carry a "do not edit" comment at the top
                of the file. That comment is an instruction to whoever opens the
                file, not to whoever reads the page, so it is stripped in
                rendering and the fact is stated here instead — where it means
                something to a reader: this text was derived from the code, so it
                cannot quietly disagree with the board.
              */
              <span className="chip">generated from the code</span>
            ) : null}
          </div>
        </header>

        {/*
          `dangerouslySetInnerHTML` with HTML this app produced itself, from
          Markdown in this repository, with every raw HTML token escaped rather
          than emitted (see src/markdown/render.ts). There is no user input on
          this path and no way for one to arrive: the input set is fixed at build
          time by the manifest.
        */}
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
