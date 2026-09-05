import type { Metadata } from 'next'
import Link from 'next/link'

import { DemoLink } from '../../src/components/demo-link'
import { Breadcrumb } from '../../src/components/site-bands'
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

function Section({
  eyebrow,
  heading,
  children,
  band = false,
}: {
  readonly eyebrow: string
  readonly heading: string
  readonly children: React.ReactNode
  readonly band?: boolean
}) {
  return (
    <section className={band ? 'border-b border-border bg-surface' : 'border-b border-border'}>
      <div className="shell grid gap-x-16 gap-y-6 py-16 sm:py-20 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <header className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="display text-large leading-[1.15]">{heading}</h2>
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
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell flex flex-col items-start gap-6 pt-14 pb-16 sm:pt-20 sm:pb-20">
          <Breadcrumb current="About" trail={[{ label: site.name, href: '/' }]} />

          <h1 className="display-hero text-huge leading-[1.04]">{about.hero.heading}</h1>
          <p className="lede max-w-[36rem] text-fg">{about.hero.lead}</p>

          <div className="essay mt-2">
            {about.hero.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <p className="statement mt-4">{about.hero.belief}</p>
        </div>
      </section>

      <Section eyebrow="Why Meith exists" heading={sections.why.heading}>
        {sections.why.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <ul className="essay-list">
          {sections.why.consequences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>{sections.why.close}</p>
      </Section>

      <Section band eyebrow="Alongside the chat" heading={sections.keeps.heading}>
        {sections.keeps.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <blockquote className="pull">{sections.keeps.pull}</blockquote>
        <p className="essay-links">
          <Link className="textlink" href={audienceHref('communities')}>
            Meith for Communities →
          </Link>
        </p>
      </Section>

      <Section eyebrow="Ownership" heading={sections.ownership.heading}>
        {sections.ownership.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <div className="owned">
          <p className="eyebrow">A community running Meith owns</p>
          <ul>
            {sections.ownership.owned.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="aside">
          <p className="font-semibold tracking-[-0.01em] text-fg">
            {sections.ownership.cost.heading}
          </p>
          <p>{sections.ownership.cost.body}</p>
        </div>
      </Section>

      <Section band eyebrow="Open source" heading={sections.openSource.heading}>
        {sections.openSource.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <blockquote className="pull">{sections.openSource.pull}</blockquote>
        <p className="essay-links">
          <a className="textlink" href={site.repository}>
            The source on GitHub
          </a>
          <a className="textlink" href={licenceHref}>
            The MIT licence
          </a>
          <Link className="textlink" href={audienceHref('open-source')}>
            Meith for Open Source →
          </Link>
        </p>
      </Section>

      <Section eyebrow="Continuity" heading={sections.handover.heading}>
        {sections.handover.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <div className="aside">
          <p>{sections.handover.outcome}</p>
        </div>
        <p className="essay-links">
          <Link className="textlink" href={docHref('organiser-guide')}>
            Handing a board over
          </Link>
        </p>
      </Section>

      <Section band eyebrow="Code-first" heading={sections.software.heading}>
        {sections.software.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p className="essay-links">
          <Link className="textlink" href={audienceHref('developers')}>
            {sections.software.link} →
          </Link>
          <Link className="textlink" href={docHref('configuration')}>
            Configuration in code
          </Link>
        </p>
      </Section>

      <Section eyebrow="The name" heading={sections.name.heading}>
        {sections.name.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </Section>

      <Section band eyebrow="The ethos" heading={sections.future.heading}>
        <p>{sections.future.lede}</p>
        <ul className="essay-list essay-list-two">
          {sections.future.aims.map((aim) => (
            <li key={aim}>{aim}</li>
          ))}
        </ul>
      </Section>

      <section className="border-b border-border">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">Principles</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              {sections.principles.heading}
            </h2>
          </header>

          <dl className="principles mt-10">
            {sections.principles.list.map((principle, index) => (
              <div key={principle.title}>
                <dt>
                  <span
                    aria-hidden
                    className="font-mono text-micro tracking-[0.12em] text-fg-subtle"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg">
                    {principle.title}
                  </span>
                </dt>
                <dd className="text-micro leading-[1.65] text-fg-muted text-pretty">
                  {principle.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="hero-glow" />
        <div className="shell flex flex-col items-start gap-6 py-20 sm:py-24">
          <h2 className="display max-w-[22ch] text-large leading-[1.12]">
            {about.closing.heading}
          </h2>
          <p className="max-w-[36rem] text-fg-muted text-pretty">{about.closing.body}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link className="btn btn-primary" href={startHref}>
              Get started
              <span aria-hidden className="btn-arrow">
                →
              </span>
            </Link>
            <a className="btn btn-quiet" href={site.repository}>
              View on GitHub
            </a>
            <Link className="btn btn-quiet" href="/docs">
              Read the docs
            </Link>
            <DemoLink className="textlink text-micro">Or look at a live board</DemoLink>
          </div>
        </div>
      </section>
    </>
  )
}
