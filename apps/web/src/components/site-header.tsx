import Link from 'next/link'

import { about } from '../content/about'
import { audienceIndexHref } from '../content/segments'
import { quickstartHref } from '../docs/registry'
import { DocsSearch } from './docs-search'
import { ForumLink } from './forum-link'
import { Logomark } from './logomark'
import { MobileMenu } from './mobile-menu'
import { ThemeToggle } from './theme-toggle'

export function SiteHeader() {
  const startHref = quickstartHref()

  return (
    <header className="site-header">
      <div className="shell site-header-inner">
        <Link href="/" className="site-wordmark" aria-label="Meith home">
          <Logomark className="site-wordmark-icon" />
          <span>meith</span>
        </Link>

        <nav aria-label="Site" className="site-navigation">
          <Link href="/">Home</Link>
          <Link href={about.href}>About</Link>
          <Link href={audienceIndexHref}>Who it’s for</Link>
          <Link href="/docs">Docs</Link>
          <ForumLink>
            Community <span aria-hidden>↗</span>
          </ForumLink>
        </nav>

        <div className="site-header-actions">
          <div className="site-header-search">
            <DocsSearch />
          </div>
          <ThemeToggle />
          <Link href={startHref} className="site-start-link">
            Get started <span aria-hidden>↗</span>
          </Link>
          <MobileMenu>
            <nav aria-label="Mobile site">
              <ul className="site-mobile-links">
                <li>
                  <Link href="/">
                    Home <span aria-hidden>↗</span>
                  </Link>
                </li>
                <li>
                  <Link href={about.href}>
                    About <span aria-hidden>↗</span>
                  </Link>
                </li>
                <li>
                  <Link href={audienceIndexHref}>
                    Who it’s for <span aria-hidden>↗</span>
                  </Link>
                </li>
                <li>
                  <Link href="/docs">
                    Docs <span aria-hidden>↗</span>
                  </Link>
                </li>
                <li>
                  <ForumLink>
                    Community <span aria-hidden>↗</span>
                  </ForumLink>
                </li>
              </ul>
              <Link className="site-start-link site-mobile-start" href={startHref}>
                Get started <span aria-hidden>↗</span>
              </Link>
            </nav>
          </MobileMenu>
        </div>
      </div>
    </header>
  )
}
