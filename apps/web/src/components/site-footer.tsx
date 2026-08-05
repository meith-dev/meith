import Link from "next/link"

import { footer, licence, licenceHref, site } from "../content/site"
import {
  docHref,
  documentsInSection,
  sections,
  type DocEntry,
  type DocSection,
} from "../docs/registry"
import { FieldMark } from "./field-mark"

/**
 * The footer, built from the same manifest as the sidebar.
 *
 * It lists the primary document of each section rather than a hand-written set
 * of links — the previous static page listed four documents by hand, and two of
 * them had been renamed by the time anyone looked.
 *
 * Grouped now, rather than run together. Eleven monospaced links in one
 * unbroken line is a list nobody reads to the end of: the eye has nothing to
 * stop on, and the two that are not documents at all — the source and
 * `llms.txt` — sat in the middle of it looking like two more.
 */
export function SiteFooter() {
  const primaries = sections
    .map((section) => {
      const doc = documentsInSection(section.id).find((entry) => entry.primary)
      return doc ? { section, doc } : null
    })
    .filter((pair): pair is { section: DocSection; doc: DocEntry } => pair !== null)

  return (
    <footer className="border-t border-wall bg-ground-deep">
      <div className="shell pt-14 pb-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-16">
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <FieldMark lit className="h-6 w-6 shrink-0" />
              <b className="font-display text-mid font-semibold tracking-[-0.015em]">{site.name}</b>
            </Link>
            <p className="max-w-[24rem] text-micro leading-[1.6] text-ink-soft text-pretty">
              {site.tagline}
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <nav aria-label="Documentation">
              <p className="eyebrow">Documentation</p>
              <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {primaries.map(({ section, doc }) => (
                  <li key={section.id}>
                    <Link
                      href={docHref(doc.slug)}
                      className="text-micro text-ink-soft transition-colors hover:text-gorse"
                    >
                      {section.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Project">
              <p className="eyebrow">Project</p>
              <ul className="mt-4 flex flex-col gap-2">
                <li>
                  <a
                    href={site.repository}
                    className="text-micro text-ink-soft transition-colors hover:text-gorse"
                  >
                    Source
                  </a>
                </li>
                <li>
                  <Link
                    href="/docs"
                    className="text-micro text-ink-soft transition-colors hover:text-gorse"
                  >
                    All documents
                  </Link>
                </li>
                <li>
                  <a
                    href={licenceHref}
                    className="text-micro text-ink-soft transition-colors hover:text-gorse"
                  >
                    Licence
                  </a>
                </li>
                <li>
                  <a
                    href="/llms.txt"
                    className="font-mono text-micro text-ink-soft transition-colors hover:text-gorse"
                  >
                    llms.txt
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3 border-t border-wall pt-6">
          <p className="max-w-[42rem] text-micro leading-[1.6] text-ink-faint text-pretty">
            {footer.colophon}
          </p>
          {/*
            The licence, where somebody looks for it. Naming the version rather
            than saying "open source" — the phrase that sends a reader hunting
            through the repository is the vague one.
          */}
          <p className="font-mono text-micro text-ink-faint">
            <a className="transition-colors hover:text-gorse" href={licenceHref}>
              {licence.spdx}
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
