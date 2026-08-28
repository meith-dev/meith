import Link from 'next/link'

import { site } from '../content/site'
import { quickstartHref } from '../docs/registry'
import { DemoLink } from './demo-link'
import { DocsSearch } from './docs-search'
import { Logomark } from './logomark'
import { ThemeToggle } from './theme-toggle'

export function SiteHeader() {
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
          <DemoLink className="text-micro font-medium text-fg-muted transition-colors hover:text-fg">
            Demo
          </DemoLink>
          <Link
            href="/for"
            className="hidden text-micro font-medium text-fg-muted transition-colors hover:text-fg sm:inline"
          >
            Who it&rsquo;s for
          </Link>
          <Link
            href="/marketplace"
            className="hidden text-micro font-medium text-fg-muted transition-colors hover:text-fg sm:inline"
          >
            Marketplace
          </Link>
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
          <Link
            href={quickstartHref()}
            className="hidden rounded-[var(--radius-control)] bg-accent px-3 py-1.5 text-micro font-medium text-accent-contrast transition-colors hover:bg-accent-hover lg:inline-block"
          >
            Start a board
          </Link>
        </nav>
      </div>
    </header>
  )
}
