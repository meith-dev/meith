import Link from "next/link"

import { site } from "../content/site"
import { DocsSearch } from "./docs-search"
import { ThemeToggle } from "./theme-toggle"

/**
 * The header, on every page including the landing page.
 *
 * Transparent and borderless over the hero canvas — the old static page had no
 * header at all there, and a solid bar would cut the townland in half — and it
 * gains its rule as soon as it is over content, via `border-b` on the wrapper
 * that the landing page overrides.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-wall bg-ground/85 backdrop-blur-sm">
      <div className="mx-auto flex w-[min(72rem,100%-2.5rem)] items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-baseline gap-3">
          <b className="font-display text-mid font-semibold tracking-[-0.015em]">{site.name}</b>
          <span className="hidden font-mono text-micro tracking-[0.1em] text-ink-faint sm:inline">
            {site.domain}
          </span>
        </Link>

        <nav aria-label="Site" className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/docs"
            className="font-mono text-micro tracking-[0.08em] text-ink-soft uppercase transition-colors hover:text-gorse"
          >
            Docs
          </Link>
          <a
            href={site.repository}
            className="font-mono text-micro tracking-[0.08em] text-ink-soft uppercase transition-colors hover:text-gorse"
          >
            Source
          </a>
          <DocsSearch />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
