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
    <div className="docs-landing">
      <header className="docs-landing-hero">
        <p className="edition-label">DOCUMENTATION</p>
        <h1>
          Let’s get you <em>started.</em>
        </h1>
        <p>From your first board to your next big idea.</p>
        <Link className="edition-button edition-button-paper" href={docHref('quickstart')}>
          Start the quickstart <span aria-hidden>↗</span>
        </Link>
      </header>

      <div className="docs-landing-grid">
        {sections.map((section) => {
          const docs = documentsInSection(section.id)
          const primary = docs.find((doc) => doc.primary)
          return (
            <section key={section.id} id={section.id} className="docs-landing-card">
              <h2>{section.title}</h2>
              <p>{section.blurb}</p>
              {primary ? (
                <Link href={docHref(primary.slug)} className="textlink docs-landing-primary">
                  {primary.title} <span aria-hidden>→</span>
                </Link>
              ) : null}
              <details>
                <summary>Browse {docs.length} guides</summary>
                <ul>
                  {docs.map((doc, index) => (
                    <li key={doc.slug}>
                      {doc.group !== undefined && doc.group !== docs[index - 1]?.group ? (
                        <p className="eyebrow">{doc.group}</p>
                      ) : null}
                      <Link href={docHref(doc.slug)}>
                        {doc.title}
                        <span aria-hidden>↗</span>
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
