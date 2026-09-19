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
        <div className="essay about-hero-essay">
          {about.hero.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <p className="statement">{about.hero.belief}</p>
      </section>

      <Movement label="Why Meith exists" heading={sections.why.heading}>
        {sections.why.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <ul className="essay-list">
          {sections.why.consequences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>{sections.why.close}</p>
      </Movement>

      <Movement band label="Alongside the chat" heading={sections.keeps.heading}>
        {sections.keeps.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <blockquote className="pull">{sections.keeps.pull}</blockquote>
        <p className="essay-links">
          <Link className="textlink" href={audienceHref('communities')}>
            Meith for Communities <span aria-hidden>→</span>
          </Link>
        </p>
      </Movement>

      <Movement label="Ownership" heading={sections.ownership.heading}>
        {sections.ownership.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
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
          <p>{sections.ownership.cost.body}</p>
        </div>
      </Movement>

      <Movement band label="Open source" heading={sections.openSource.heading}>
        {sections.openSource.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <blockquote className="pull">{sections.openSource.pull}</blockquote>
        <p className="essay-links">
          <a className="textlink" href={site.repository}>
            The source on GitHub <span aria-hidden>↗</span>
          </a>
          <a className="textlink" href={licenceHref}>
            The MIT licence <span aria-hidden>↗</span>
          </a>
          <Link className="textlink" href={audienceHref('open-source')}>
            Meith for Open Source <span aria-hidden>→</span>
          </Link>
        </p>
      </Movement>

      <Movement label="Continuity" heading={sections.handover.heading}>
        {sections.handover.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <div className="aside">
          <p>{sections.handover.outcome}</p>
        </div>
        <p className="essay-links">
          <Link className="textlink" href={docHref('organiser-guide')}>
            Handing a board over <span aria-hidden>→</span>
          </Link>
        </p>
      </Movement>

      <Movement band label="Code-first" heading={sections.software.heading}>
        {sections.software.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p className="essay-links">
          <Link className="textlink" href={audienceHref('developers')}>
            {sections.software.link} <span aria-hidden>→</span>
          </Link>
          <Link className="textlink" href={docHref('configuration')}>
            Configuration in code <span aria-hidden>→</span>
          </Link>
        </p>
      </Movement>

      <Movement label="The name" heading={sections.name.heading}>
        {sections.name.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </Movement>

      <Movement band label="The ethos" heading={sections.future.heading}>
        <p>{sections.future.lede}</p>
        <ul className="essay-list essay-list-two">
          {sections.future.aims.map((aim) => (
            <li key={aim}>{aim}</li>
          ))}
        </ul>
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
