import Link from 'next/link'

import { about } from '../content/about'
import { audienceHref, audienceIndexHref, audiences } from '../content/segments'
import { site } from '../content/site'
import { quickstartHref } from '../docs/registry'
import { DemoLink } from './demo-link'
import { DocsSearch } from './docs-search'
import { Logomark } from './logomark'
import { MobileMenu } from './mobile-menu'
import { ThemeToggle } from './theme-toggle'

const item = 'text-micro font-medium text-fg-muted transition-colors hover:text-fg'

export function SiteHeader() {
  const startHref = quickstartHref()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-lg">
      <div aria-hidden className="top-beam" />
      <div className="shell flex items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Logomark className="h-6 w-6 shrink-0" />
          <b className="text-mid font-semibold tracking-[-0.03em]">{site.name}</b>
        </Link>

        <nav aria-label="Site" className="flex items-center gap-3 sm:gap-4">
          <Link href="/" className={`hidden ${item} md:inline`}>
            Product
          </Link>

          <div className="menu hidden md:block">
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

          <Link href="/docs" className={`hidden ${item} md:inline`}>
            Docs
          </Link>
          <DemoLink className={`hidden ${item} md:inline`}>Demo</DemoLink>
          <Link href={about.href} className={`hidden ${item} lg:inline`}>
            About
          </Link>
          <a href={site.repository} className={`hidden ${item} md:inline`}>
            GitHub
          </a>
          <DocsSearch />
          <ThemeToggle />
          <Link
            href={startHref}
            className="hidden rounded-[var(--radius-control)] bg-accent px-3 py-1.5 text-micro font-medium text-accent-contrast transition-colors hover:bg-accent-hover lg:inline-block"
          >
            Get started
          </Link>

          <MobileMenu>
            <ul className="mobile-menu-list">
              <li>
                <Link className="mobile-menu-link" href="/">
                  Product
                </Link>
              </li>
              <li>
                <Link className="mobile-menu-link" href={audienceIndexHref}>
                  Who it&rsquo;s for
                </Link>
                <ul className="mobile-menu-sublist">
                  {audiences.map((audience) => (
                    <li key={audience.slug}>
                      <Link className="mobile-menu-link" href={audienceHref(audience.slug)}>
                        {audience.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
              <li>
                <Link className="mobile-menu-link" href="/docs">
                  Docs
                </Link>
              </li>
              <li>
                <DemoLink className="mobile-menu-link">Demo</DemoLink>
              </li>
              <li>
                <Link className="mobile-menu-link" href={about.href}>
                  About
                </Link>
              </li>
              <li>
                <a className="mobile-menu-link" href={site.repository}>
                  GitHub
                </a>
              </li>
            </ul>
            <Link className="btn btn-primary mt-4 w-full" href={startHref}>
              Get started
              <span aria-hidden className="btn-arrow">
                →
              </span>
            </Link>
          </MobileMenu>
        </nav>
      </div>
    </header>
  )
}
