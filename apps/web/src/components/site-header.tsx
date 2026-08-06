import Link from "next/link"

import { site } from "../content/site"
import { docHref, documentsInSection, sections } from "../docs/registry"
import { DocsSearch } from "./docs-search"
import { FieldMark } from "./field-mark"
import { ThemeToggle } from "./theme-toggle"

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
          { }
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
