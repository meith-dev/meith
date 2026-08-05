import Link from "next/link"

import { site } from "../content/site"
import { docHref, documentsInSection, sections } from "../docs/registry"
import { DocsSearch } from "./docs-search"
import { FieldMark } from "./field-mark"
import { ThemeToggle } from "./theme-toggle"

/**
 * The header, on every page including the landing page.
 *
 * Three changes from the version that carried nothing but a wordmark.
 *
 * It has the mark on it. The identity is a townland seen from above and the one
 * place anybody looks for a logo was a word set in a serif.
 *
 * It carries the call to action. A reader who has spent ten minutes in the
 * operator handbook and decided to try it had, before this, no way to start
 * without scrolling to the foot of the document — and the destination comes from
 * the manifest, so renaming the quickstart moves this link with it.
 *
 * And it is translucent over its own blur rather than opaque, which is what lets
 * the hero canvas keep running underneath it.
 */
export function SiteHeader() {
  const running = sections.find((section) => section.id === "running")
  const quickstart = running ? documentsInSection(running.id).find((doc) => doc.primary) : undefined

  return (
    <header className="sticky top-0 z-40 border-b border-wall bg-ground/92 backdrop-blur-md">
      <div className="shell flex items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <FieldMark lit className="h-6 w-6 shrink-0" />
          <b className="font-display text-mid font-semibold tracking-[-0.015em]">{site.name}</b>
          <span className="hidden font-mono text-micro tracking-[0.1em] text-ink-faint sm:inline">
            {site.domain}
          </span>
        </Link>

        <nav aria-label="Site" className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/docs"
            className="font-mono text-micro tracking-[0.08em] text-ink-soft uppercase transition-colors hover:text-gorse"
          >
            Docs
          </Link>
          <a
            href={site.repository}
            className="hidden font-mono text-micro tracking-[0.08em] text-ink-soft uppercase transition-colors hover:text-gorse sm:inline"
          >
            Source
          </a>
          <DocsSearch />
          <ThemeToggle />
          {/*
            Last in the row and hidden until there is room for it. On a phone the
            search field and the scheme control are what somebody who is already
            here needs; the landing page's own buttons are one tap away.
          */}
          <Link
            href={quickstart ? docHref(quickstart.slug) : "/docs"}
            className="hidden rounded-sm border border-gorse bg-gorse px-3 py-1.5 font-mono text-micro tracking-[0.08em] text-on-gorse uppercase transition-colors hover:bg-gorse-flat lg:inline-block"
          >
            Start a board
          </Link>
        </nav>
      </div>
    </header>
  )
}
