import type { Metadata } from 'next'
import Link from 'next/link'

import { site } from '../../src/content/site'
import { docHref, documentsInSection, internalDocuments, sections } from '../../src/docs/registry'

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Every document Meith publishes, organised by what you are trying to do: run a board, ' +
    'write a theme or a plugin, call the API, or move a community off MyBB.',
  alternates: { canonical: '/docs' },
}

export default function DocsIndexPage() {
  return (
    <div className="max-w-[46rem]">
      <p className="eyebrow">Documentation</p>
      <h1 className="display mt-3 text-huge leading-[1.05]">
        Each document has one audience and one job.
      </h1>
      <p className="mt-5 text-mid leading-[1.45] text-fg-muted text-pretty">
        Four of these are generated from the code they describe, and{' '}
        <code className="font-mono text-[0.9em]">pnpm verify</code> fails when one of them is stale.
        A reference read by somebody who cannot see the source is worse than no reference when it is
        wrong.
      </p>

      <div className="mt-14 flex flex-col gap-14">
        {sections.map((section) => (
          <section key={section.id} id={section.id}>
            <h2 className="text-large font-semibold tracking-[-0.025em] text-fg">
              {section.title}
            </h2>
            <p className="mt-1 text-micro text-fg-subtle text-pretty">{section.blurb}</p>

            <ul className="mt-5 flex flex-col border-t border-border">
              {documentsInSection(section.id).map((doc) => (
                <li key={doc.slug} className="border-b border-border">
                  <Link href={docHref(doc.slug)} className="group row-link">
                    <span className="flex flex-wrap items-baseline gap-3">
                      <span className="text-mid text-fg transition-colors group-hover:text-accent">
                        {doc.title}
                      </span>
                      {doc.generated ? <span className="chip">generated</span> : null}
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
          </section>
        ))}
      </div>

      <section className="card mt-16 bg-surface p-6">
        <h2 className="text-mid font-semibold tracking-[-0.02em] text-fg">
          Kept in the repository
        </h2>
        <p className="mt-1 text-micro text-fg-muted">
          These are working records rather than documentation, and they are only meaningful beside
          the plan they are written against.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {internalDocuments.map((doc) => (
            <li key={doc.file} className="text-micro text-fg-muted">
              <a
                className="textlink font-mono"
                href={`${site.repository}/blob/main/docs/${doc.file}`}
              >
                docs/{doc.file}
              </a>{' '}
              — {doc.reason}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-micro text-fg-subtle">
        Every page here is rendered from the Markdown in{' '}
        <a className="textlink font-mono" href={`${site.repository}/tree/main/docs`}>
          docs/
        </a>{' '}
        at build time. There is no second copy to fall behind, and a document is corrected by
        editing that file.
      </p>
    </div>
  )
}
