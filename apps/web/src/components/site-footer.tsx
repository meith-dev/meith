import Link from "next/link"

import { footer, site } from "../content/site"
import { docHref, documentsInSection, sections } from "../docs/registry"

/**
 * The footer, built from the same manifest as the sidebar.
 *
 * It lists the primary document of each section rather than a hand-written set
 * of links — the previous static page listed four documents by hand, and two of
 * them had been renamed by the time anyone looked.
 */
export function SiteFooter() {
  const primaries = sections
    .map((section) => documentsInSection(section.id).find((doc) => doc.primary))
    .filter((doc) => doc !== undefined)

  return (
    <footer className="border-t border-wall">
      <div className="mx-auto flex w-[min(72rem,100%-2.5rem)] flex-col gap-8 pt-12 pb-16">
        <div className="flex flex-wrap items-baseline justify-between gap-x-12 gap-y-6">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <a
              href={site.repository}
              className="font-mono text-micro tracking-[0.06em] text-ink-soft transition-colors hover:text-gorse"
            >
              Source
            </a>
            <Link
              href="/docs"
              className="font-mono text-micro tracking-[0.06em] text-ink-soft transition-colors hover:text-gorse"
            >
              Docs
            </Link>
            {primaries.map((doc) => (
              <Link
                key={doc.slug}
                href={docHref(doc.slug)}
                className="font-mono text-micro tracking-[0.06em] text-ink-soft transition-colors hover:text-gorse"
              >
                {doc.title}
              </Link>
            ))}
            <a
              href="/llms.txt"
              className="font-mono text-micro tracking-[0.06em] text-ink-soft transition-colors hover:text-gorse"
            >
              llms.txt
            </a>
          </nav>
        </div>

        <p className="font-mono text-micro tracking-[0.06em] text-ink-faint">
          <span className="font-display text-gorse italic">{footer.proverb}</span>{" "}
          {footer.translation}
        </p>
      </div>
    </footer>
  )
}
