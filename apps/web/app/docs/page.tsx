import type { Metadata } from 'next'
import Link from 'next/link'

import { site } from '../../src/content/site'
import { docHref, documentsInSection, sections } from '../../src/docs/registry'
import { ogImage } from '../../src/og/card'

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Find step-by-step guides for members, community administrators, operators and developers.',
  alternates: { canonical: '/docs' },
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: `${site.name} documentation`,
    description:
      'Find step-by-step guides for members, community administrators, operators and developers.',
    url: '/docs',
    images: ogImage('/docs/og/index', `${site.name} documentation`),
  },
}

export default function DocsIndexPage() {
  return (
    <div className="max-w-[46rem]">
      <p className="eyebrow">Documentation</p>
      <h1 className="display mt-3 text-huge leading-[1.05]">Meith documentation</h1>
      <p className="mt-5 text-mid leading-[1.45] text-fg-muted text-pretty">
        Choose what you want to do. Each path starts with the basics and leads to focused guides and
        reference material.
      </p>

      <nav aria-label="Documentation sections" className="mt-8 flex flex-wrap gap-3">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="textlink text-micro">
            {section.title}
          </a>
        ))}
      </nav>

      <div className="mt-10 grid gap-6">
        {sections.map((section) => {
          const docs = documentsInSection(section.id)
          const primary = docs.find((doc) => doc.primary)
          return (
            <section key={section.id} id={section.id} className="card scroll-mt-24 p-6">
              <h2 className="text-large font-semibold tracking-[-0.025em] text-fg">
                {section.title}
              </h2>
              <p className="mt-1 text-micro text-fg-subtle text-pretty">{section.blurb}</p>

              {primary ? (
                <Link href={docHref(primary.slug)} className="textlink mt-4 inline-block">
                  {primary.title} →
                </Link>
              ) : null}

              <details className="mt-5">
                <summary className="cursor-pointer text-micro text-fg-muted">
                  Browse all {docs.length} guides
                </summary>
                <ul className="mt-3 flex flex-col border-t border-border">
                  {docs.map((doc, index) => (
                    <li key={doc.slug} className="border-b border-border">
                      {doc.group !== undefined && doc.group !== docs[index - 1]?.group ? (
                        <p className="eyebrow pt-5 pb-1">{doc.group}</p>
                      ) : null}
                      <Link href={docHref(doc.slug)} className="group row-link">
                        <span className="flex flex-wrap items-baseline gap-3">
                          <span className="text-mid text-fg transition-colors group-hover:text-accent">
                            {doc.title}
                          </span>
                          {doc.primary ? <span className="chip">Start here</span> : null}
                        </span>
                        <span
                          aria-hidden
                          className="font-mono text-micro text-fg-subtle transition-colors group-hover:text-accent"
                        >
                          →
                        </span>
                        <span className="text-micro text-pretty text-fg-muted">{doc.blurb}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )
        })}
      </div>
    </div>
  )
}
