import Link from 'next/link'

import { audienceHref, audienceIndexHref, audiences } from '../content/segments'
import { site } from '../content/site'
import { quickstartHref } from '../docs/registry'
import { DemoLink } from './demo-link'
import { DocsSearch } from './docs-search'
import { Logomark } from './logomark'
import { ThemeToggle } from './theme-toggle'

const item = 'text-micro font-medium text-fg-muted transition-colors hover:text-fg'

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
          <Link href="/" className={`hidden ${item} md:inline`}>
            Product
          </Link>

          <div className="menu hidden sm:block">
            <Link href={audienceIndexHref} className={`${item} inline-flex items-center gap-1`}>
              Who it&rsquo;s for
              <span aria-hidden className="menu-caret">
                ▾
              </span>
            </Link>
            <ul aria-label="Audiences" className="menu-list">
              {audiences.map((audience) => (
                <li key={audience.slug}>
                  <Link className="menu-item" href={audienceHref(audience.slug)}>
                    {audience.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link className="menu-item menu-item-all" href={audienceIndexHref}>
                  Who is Meith for? →
                </Link>
              </li>
            </ul>
          </div>

          <Link href="/docs" className={item}>
            Docs
          </Link>
          <DemoLink className={item}>Demo</DemoLink>
          <a href={site.repository} className={`hidden ${item} sm:inline`}>
            GitHub
          </a>
          <DocsSearch />
          <ThemeToggle />
          <Link
            href={quickstartHref()}
            className="hidden rounded-[var(--radius-control)] bg-accent px-3 py-1.5 text-micro font-medium text-accent-contrast transition-colors hover:bg-accent-hover lg:inline-block"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  )
}
