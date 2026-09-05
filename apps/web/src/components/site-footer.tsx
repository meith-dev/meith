import Link from 'next/link'

import { about } from '../content/about'
import { audienceHref, audienceIndexHref, audiences } from '../content/segments'
import { footer, licence, licenceHref, site } from '../content/site'
import { version } from '../content/version'
import {
  type DocEntry,
  type DocSection,
  docHref,
  documentsInSection,
  sections,
} from '../docs/registry'
import { Logomark } from './logomark'

const item = 'text-micro text-fg-muted transition-colors hover:text-fg'

export function SiteFooter() {
  const primaries = sections
    .map((section) => {
      const doc = documentsInSection(section.id).find((entry) => entry.primary)
      return doc ? { section, doc } : null
    })
    .filter((pair): pair is { section: DocSection; doc: DocEntry } => pair !== null)

  return (
    <footer className="border-t border-border bg-surface">
      <div className="shell pt-14 pb-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-16">
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <Logomark className="h-6 w-6 shrink-0" />
              <b className="text-mid font-semibold tracking-[-0.03em]">{site.name}</b>
            </Link>
            <p className="max-w-[24rem] text-micro leading-[1.6] text-fg-muted text-pretty">
              {site.tagline}
            </p>
            <p className="max-w-[24rem] text-micro leading-[1.6] text-fg-subtle text-pretty">
              Built for communities. Owned by them.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            <nav aria-label="Who it's for">
              <p className="eyebrow">Who it&rsquo;s for</p>
              <ul className="mt-4 flex flex-col gap-2">
                {audiences.map((audience) => (
                  <li key={audience.slug}>
                    <Link href={audienceHref(audience.slug)} className={item}>
                      {audience.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href={audienceIndexHref} className={item}>
                    All audiences
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Documentation">
              <p className="eyebrow">Documentation</p>
              <ul className="mt-4 flex flex-col gap-2">
                {primaries.map(({ section, doc }) => (
                  <li key={section.id}>
                    <Link href={docHref(doc.slug)} className={item}>
                      {section.title}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/docs" className={item}>
                    All documents
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Project">
              <p className="eyebrow">Project</p>
              <ul className="mt-4 flex flex-col gap-2">
                <li>
                  <Link href={about.href} className={item}>
                    About Meith
                  </Link>
                </li>
                <li>
                  <a href={site.repository} className={item}>
                    GitHub
                  </a>
                </li>
                <li>
                  <a href={site.demo} className={item} rel="noreferrer">
                    Live demo
                  </a>
                </li>
                <li>
                  <Link href="/marketplace" className={item}>
                    Marketplace
                  </Link>
                </li>
                <li>
                  <a href={licenceHref} className={item}>
                    Licence
                  </a>
                </li>
                <li>
                  <a href="/llms.txt" className={`font-mono ${item}`}>
                    llms.txt
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3 border-t border-border pt-6">
          <div className="flex max-w-[46rem] flex-wrap items-baseline gap-x-5 gap-y-2">
            <p className="text-micro leading-[1.6] text-fg-subtle text-pretty">
              <b className="font-mono font-normal text-fg-muted">
                {site.name} {version}
              </b>{' '}
              — {footer.note}
            </p>

            <span className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              {footer.links.map((link) =>
                'doc' in link ? (
                  <Link className={item} href={docHref(link.doc)} key={link.label}>
                    {link.label}
                  </Link>
                ) : (
                  <a className={item} href={link.href} key={link.label}>
                    {link.label}
                  </a>
                ),
              )}
            </span>
          </div>

          <p className="font-mono text-micro text-fg-subtle">
            <a className="transition-colors hover:text-fg" href={licenceHref}>
              {licence.spdx}
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
