import Link from 'next/link'

import { CommandLine } from '../src/components/command-line'
import { ForumLink } from '../src/components/forum-link'
import { scaffoldCommand, site } from '../src/content/site'
import { docHref, quickstartHref } from '../src/docs/registry'

const communities = [
  { name: 'Developers', slug: 'developers', body: 'A community that lives alongside your code.' },
  {
    name: 'Open-source projects',
    slug: 'open-source',
    body: 'A home for questions and ideas beyond the issue tracker.',
  },
  {
    name: 'Communities',
    slug: 'communities',
    body: 'Keep the conversations that bring your people together.',
  },
  {
    name: 'Clubs & associations',
    slug: 'clubs-and-associations',
    body: 'A shared space for members, plans and club life.',
  },
] as const

export default function LandingPage() {
  return (
    <div className="editorial-home">
      <section className="edition-hero" id="product">
        <div className="shell">
          <div className="edition-running-head">
            <p>OPEN-SOURCE FORUM SOFTWARE</p>
            <a href={site.repository}>
              BUILT IN THE OPEN <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="edition-hero-grid">
            <h1>
              Long live
              <br />
              <em>the forum.</em>
            </h1>
            <div className="edition-hero-copy">
              <p>
                A proper home for your community.
                <br />
                On your domain. On your terms.
              </p>
              <div className="edition-hero-actions">
                <Link className="edition-button edition-button-paper" href={quickstartHref()}>
                  Start your forum <span aria-hidden="true">↗</span>
                </Link>
                <ForumLink className="edition-hero-source">
                  See Meith in use <span aria-hidden="true">↗</span>
                </ForumLink>
              </div>
              <p className="edition-hero-note">Free & open source. Self-hosted. Yours to keep.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="shell edition-audiences" aria-labelledby="audiences-heading">
        <div className="edition-audiences-heading">
          <div className="edition-section-title">
            <p className="edition-label">WHO IT’S FOR</p>
            <h2 id="audiences-heading">
              Your kind of <em>community.</em>
            </h2>
          </div>
          <Link className="edition-text-link" href="/who-its-for">
            Find your fit <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="edition-audience-grid">
          {communities.map((community) => (
            <Link key={community.slug} href={`/who-its-for/${community.slug}`}>
              <div>
                <h3>{community.name}</h3>
                <span aria-hidden="true">↗</span>
              </div>
              <p>{community.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="edition-customise" id="customise" aria-labelledby="customise-heading">
        <div className="shell edition-customise-grid">
          <div className="edition-section-title">
            <p className="edition-label">MAKE IT YOURS</p>
            <h2 id="customise-heading">
              Your community.
              <br />
              <em>Your expression.</em>
            </h2>
          </div>
          <div className="edition-customise-copy">
            <p>
              Build a theme that’s entirely your own. Add the features your people need. Meith gives
              you the foundations; you decide what it becomes.
            </p>
            <nav aria-label="Customise Meith">
              <Link href={docHref('themes')}>
                Build a theme <span aria-hidden="true">↗</span>
              </Link>
              <Link href={docHref('plugins')}>
                Extend with plugins <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/marketplace">
                Explore the marketplace <span aria-hidden="true">↗</span>
              </Link>
            </nav>
          </div>
        </div>
      </section>

      <section className="edition-start" aria-labelledby="start-heading">
        <div className="shell edition-start-grid">
          <div className="edition-section-title">
            <p className="edition-label">OVER TO YOU</p>
            <h2 id="start-heading">
              Start something
              <br />
              <em>worth keeping.</em>
            </h2>
          </div>
          <div className="edition-start-actions">
            <CommandLine command={scaffoldCommand} />
            <div>
              <Link className="edition-button" href={quickstartHref()}>
                Create your community <span aria-hidden="true">↗</span>
              </Link>
              <Link className="edition-text-link" href="/docs">
                Read the docs <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <p>Free software. Your infrastructure. Your future.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
