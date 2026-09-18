import type { Metadata } from 'next'
import Link from 'next/link'

import { Logomark } from '../../src/components/logomark'
import { Breadcrumb, ClosingBand } from '../../src/components/site-bands'
import { about } from '../../src/content/about'
import { licenceHref, site } from '../../src/content/site'
import { quickstartHref } from '../../src/docs/registry'
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

export default function AboutPage() {
  return (
    <div className="marketing-page">
      <section className="shell marketing-hero">
        <Breadcrumb current="About" trail={[{ label: site.name, href: '/' }]} />
        <div className="marketing-hero-copy">
          <h1 className="marketing-title">
            A place
            <br />
            <span>of our own.</span>
          </h1>
          <p className="marketing-lead">
            Good communities deserve a home that belongs to them. That’s why we’re building Meith.
          </p>
        </div>
        <div className="about-statement">
          <Logomark className="about-mark" />
          <p>
            Built together.
            <br />
            Kept by the community.
          </p>
          <span>Open source. Always yours.</span>
        </div>
      </section>

      <section className="shell marketing-section">
        <div className="marketing-section-heading">
          <p className="eyebrow">What we believe</p>
          <h2>
            Good conversations
            <br />
            deserve to last.
          </h2>
        </div>
        <div className="marketing-values">
          <article>
            <span className="marketing-number">01</span>
            <h3>Your community. Your home.</h3>
            <p>
              Your domain, your server, your data. Meith is MIT-licensed software you can inspect,
              adapt and take with you.
            </p>
          </article>
          <article>
            <span className="marketing-number">02</span>
            <h3>Keep what matters.</h3>
            <p>
              Give answers, ideas and decisions a permanent place. A useful discussion should still
              be useful years later.
            </p>
          </article>
          <article>
            <span className="marketing-number">03</span>
            <h3>Built to be handed on.</h3>
            <p>
              People move on. Communities carry on. A repository, a database and clear documentation
              keep the next organiser in the picture.
            </p>
          </article>
        </div>
      </section>

      <section className="shell marketing-section about-origin">
        <p className="eyebrow">Behind the name</p>
        <div>
          <h2>
            Meith, from <em>meitheal.</em>
          </h2>
          <p className="marketing-lead">
            An Irish tradition of neighbours coming together to do shared work. Everyone brings
            something. The result belongs to the community.
          </p>
          <div className="marketing-actions">
            <a className="textlink" href={site.repository}>
              Explore the source <span aria-hidden>↗</span>
            </a>
            <a className="textlink" href={licenceHref}>
              Read the MIT licence <span aria-hidden>↗</span>
            </a>
            <Link className="textlink" href="/who-its-for">
              Find your community <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      <ClosingBand
        heading="Make room for your people."
        body="Start a community on your own terms."
        startHref={quickstartHref()}
      />
    </div>
  )
}
