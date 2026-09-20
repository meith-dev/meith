import type { Metadata } from 'next'
import Link from 'next/link'

import { site } from '../../src/content/site'
import { docHref, documentsInSection, sections } from '../../src/docs/registry'
import { ogImage } from '../../src/og/card'

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Meith setup, administration, operation and development guides.',
  alternates: { canonical: '/docs' },
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: `${site.name} documentation`,
    description: 'Meith setup, administration, operation and development guides.',
    url: '/docs',
    images: ogImage('/docs/og/index', `${site.name} documentation`),
  },
}

export default function DocsIndexPage() {
  return (
    <div className="docs-landing">
      <header className="docs-landing-hero">
        <h1>Documentation</h1>
        <Link className="textlink" href={docHref('quickstart')}>
          Run a local preview <span aria-hidden>↗</span>
        </Link>
      </header>

      <div className="docs-landing-grid">
        {sections.map((section) => {
          const docs = documentsInSection(section.id)
          return (
            <section key={section.id} id={section.id} className="docs-landing-card">
              <h2>{section.title}</h2>
              <ul>
                {docs.map((doc, index) => (
                  <li key={doc.slug}>
                    {doc.group !== undefined && doc.group !== docs[index - 1]?.group ? (
                      <p className="eyebrow">{doc.group}</p>
                    ) : null}
                    <Link className="textlink" href={docHref(doc.slug)}>
                      {doc.title}
                      <span aria-hidden>↗</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
