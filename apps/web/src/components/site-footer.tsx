import Link from 'next/link'

import { about } from '../content/about'
import { audienceIndexHref } from '../content/segments'
import { licence, licenceHref, site } from '../content/site'
import { version } from '../content/version'
import { ForumLink } from './forum-link'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="site-footer-main">
          <Link href="/" className="site-footer-wordmark" aria-label="Meith home">
            meith
          </Link>
          <nav aria-label="Footer" className="site-footer-navigation">
            <Link href={about.href}>About</Link>
            <Link href={audienceIndexHref}>Who it’s for</Link>
            <Link href="/marketplace">Extensions</Link>
            <Link href="/docs">Docs</Link>
            <ForumLink href={site.demo}>
              Demo <span aria-hidden>↗</span>
            </ForumLink>
            <ForumLink>
              Community <span aria-hidden>↗</span>
            </ForumLink>
            <a href={site.repository}>
              GitHub <span aria-hidden>↗</span>
            </a>
          </nav>
        </div>
        <div className="site-footer-bottom">
          <div>
            <a href={`${site.repository}/releases`}>v{version}</a>
            <span aria-hidden>·</span>
            <a href={licenceHref}>{licence.spdx} licensed</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
