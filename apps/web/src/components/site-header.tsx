import Link from "next/link"

import { site } from "../content/site"
import { docHref, documentsInSection, sections } from "../docs/registry"
import { DocsSearch } from "./docs-search"
import { Logomark } from "./logomark"
import { ThemeToggle } from "./theme-toggle"

/**
 * The header, on every page including the landing page.
 *
 * It carries the call to action. A reader who has spent ten minutes in the
 * operator handbook and decided to try it had, before this, no way to start
 * without scrolling to the foot of the document — and the destination comes from
 * the manifest, so renaming the quickstart moves this link with it.
 *
 * Translucent over its own blur rather than opaque, which is what lets the
 * hero's ruled grid keep running underneath it.
 *
 * The hairline along the top is the site's one piece of pure decoration, and it
 * is one pixel: a gradient of the accent, fading out to the right. It is what
 * makes the first screen read as having a colour before the eye reaches the
 * button.
 */
export function SiteHeader() {
  const running = sections.find((section) => section.id === "running")
  const quickstart = running ? documentsInSection(running.id).find((doc) => doc.primary) : undefined

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-lg">
      <div aria-hidden className="top-beam" />
      <div className="shell flex items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Logomark className="h-6 w-6 shrink-0" />
          <b className="text-mid font-semibold tracking-[-0.03em]">{site.name}</b>
          <span className="hidden font-mono text-micro tracking-[0.06em] text-fg-subtle sm:inline">
            {site.domain}
          </span>
        </Link>

        <nav aria-label="Site" className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/docs"
            className="text-micro font-medium text-fg-muted transition-colors hover:text-fg"
          >
            Docs
          </Link>
          <a
            href={site.repository}
            className="hidden text-micro font-medium text-fg-muted transition-colors hover:text-fg sm:inline"
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
            className="hidden rounded-[var(--radius-control)] bg-accent px-3 py-1.5 text-micro font-medium text-accent-contrast transition-colors hover:bg-accent-hover lg:inline-block"
          >
            Start a board
          </Link>
        </nav>
      </div>
    </header>
  )
}
