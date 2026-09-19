import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { Breadcrumb, ClosingBand } from '../../src/components/site-bands'
import { about } from '../../src/content/about'
import { audienceHref } from '../../src/content/segments'
import { licenceHref, site } from '../../src/content/site'
import { docHref, quickstartHref } from '../../src/docs/registry'
import { ogImage } from '../../src/og/card'

export const metadata: Metadata = {
  title: { absolute: about.meta.title },
  description: about.meta.description,
  alternates: { canonical: about.href },
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: about.meta.title,
    description: about.meta.description,
    url: `${site.url}${about.href}`,
    images: ogImage(`${about.href}/og`, about.meta.title),
  },
  twitter: {
    card: 'summary_large_image',
    title: about.meta.title,
    description: about.meta.description,
  },
}

function Movement({
  label,
  heading,
  band = false,
  children,
}: {
  readonly label: string
  readonly heading: ReactNode
  readonly band?: boolean
  readonly children: ReactNode
}) {
  return (
    <section className={band ? 'about-movement about-movement-band' : 'about-movement'}>
      <div className="shell about-movement-grid">
        <header className="about-movement-head">
          <p className="edition-label">{label}</p>
          <h2>{heading}</h2>
        </header>
        <div className="essay">{children}</div>
      </div>
    </section>
  )
}

export default function AboutPage() {
  const { sections } = about
  const startHref = quickstartHref()

  return (
    <div className="marketing-page about-page">
      <section className="shell marketing-hero marketing-hero-compact">
        <Breadcrumb current="About" trail={[{ label: site.name, href: '/' }]} />
        <div className="marketing-hero-copy">
          <h1 className="marketing-title">
            A place
            <br />
            <span>of our own.</span>
          </h1>
          <p className="marketing-lead">{about.hero.lead}</p>
        </div>
        <p className="statement">{about.hero.belief}</p>
      </section>

      <Movement
        label="Why Meith exists"
        heading={
          <>
            Communities deserve a home they can <em>own.</em>
          </>
        }
      >
        <p>
          The platform is rarely the problem — depending on one you can’t control is. Years of
          answers, guides and decisions can sit inside a product whose priorities are set somewhere
          else, and may change.
        </p>
        <p className="about-list-label edition-label">What that can cost a community</p>
        <ul className="essay-list essay-list-two">
          {sections.why.consequences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Movement>

      <Movement
        band
        label="Alongside the chat"
        heading={
          <>
            Chat is for now. Meith is <em>for keeps.</em>
          </>
        }
      >
        <p>
          Meith doesn’t replace the chat. Chat is for right now; Meith is for what a community still
          needs months later — the answers, decisions, guides and events worth returning to.
        </p>
        <blockquote className="pull">{sections.keeps.pull}</blockquote>
        <p className="essay-links">
          <Link className="textlink" href={audienceHref('communities')}>
            Meith for Communities <span aria-hidden>→</span>
          </Link>
        </p>
      </Movement>

      <Movement
        label="Ownership"
        heading={
          <>
            Ownership is not an <em>enterprise feature.</em>
          </>
        }
      >
        <p>
          Self-hosting, open source and data ownership aren’t a top-tier upsell — they’re the point.
          Nothing sits between a community and its members.
        </p>
        <div className="owned">
          <p className="edition-label">A community running Meith owns</p>
          <ul>
            {sections.ownership.owned.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="aside">
          <p className="about-aside-lead">{sections.ownership.cost.heading}</p>
          <p>
            No licence fee and nothing per member — growing your community never grows the bill.
          </p>
        </div>
      </Movement>

      <Movement
        band
        label="Open source"
        heading={
          <>
            Open source <em>by design.</em>
          </>
        }
      >
        <blockquote className="pull">{sections.openSource.pull}</blockquote>
        <p>
          MIT licensed, with no hosted edition holding features back. Read it, extend it, fork it —
          and if the maintainers ever disappear, the community carries on.
        </p>
        <p className="essay-links">
          <a className="textlink" href={site.repository}>
            The source on GitHub <span aria-hidden>↗</span>
          </a>
          <a className="textlink" href={licenceHref}>
            The MIT licence <span aria-hidden>↗</span>
          </a>
        </p>
      </Movement>

      <Movement
        label="Continuity"
        heading={
          <>
            Handed over, not <em>started over.</em>
          </>
        }
      >
        <p>
          Communities outlive the people running them. A board is a repository and a database, so it
          is handed over in the admin panel rather than locked to one person’s account.
        </p>
        <p className="essay-links">
          <Link className="textlink" href={docHref('operating', 'keep-a-recovery-handover')}>
            Handing a board over <span aria-hidden>→</span>
          </Link>
        </p>
      </Movement>

      <Movement
        band
        label="The name"
        heading={
          <>
            Why <em>“Meith”?</em>
          </>
        }
      >
        <p>
          Meith takes its name from <em>meitheal</em> — an Irish tradition of neighbours coming
          together for shared work. No one owns the effort, and the result belongs to the community.
        </p>
      </Movement>

      <section className="about-movement">
        <div className="shell">
          <header className="about-movement-head about-principles-head">
            <p className="edition-label">Principles</p>
            <h2>{sections.principles.heading}</h2>
          </header>
          <dl className="principles">
            {sections.principles.list.map((principle, index) => (
              <div key={principle.title}>
                <dt>
                  <span aria-hidden className="about-principle-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="about-principle-title">{principle.title}</span>
                </dt>
                <dd>{principle.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <ClosingBand
        heading={about.closing.heading}
        body={about.closing.body}
        startHref={startHref}
        docsHref={docHref('introduction')}
      />
    </div>
  )
}
