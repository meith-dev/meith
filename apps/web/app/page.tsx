import Link from 'next/link'

import { AudienceCards } from '../src/components/audience-cards'
import { CommandLine } from '../src/components/command-line'
import { DemoLink } from '../src/components/demo-link'
import { SchemeScreenshot } from '../src/components/screenshot'
import { ClosingBand, DocLinks } from '../src/components/site-bands'
import { Terminal } from '../src/components/terminal'
import { ThemeShowcase } from '../src/components/theme-showcase'
import { readFacts } from '../src/content/facts'
import { audienceHref, audienceIndexHref, primaryAudiences } from '../src/content/segments'
import {
  audiencesBand,
  closing,
  customisation,
  developerTeaser,
  devices,
  devTerminal,
  hero,
  keeps,
  licenceHref,
  memberships,
  openSource,
  ownership,
  performance,
  scaffoldCommand,
  shots,
  site,
  themes,
} from '../src/content/site'
import { docHref, quickstartHref } from '../src/docs/registry'

export default async function LandingPage() {
  const facts = await readFacts()
  const startHref = quickstartHref()
  const board = themes.list[0]!

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell grid gap-x-12 gap-y-10 pt-14 pb-16 sm:pt-20 sm:pb-20 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-center">
          <div className="flex max-w-[42rem] flex-col items-start gap-6">
            <p className="badge">
              <span aria-hidden className="badge-dot" />
              {hero.badge}
            </p>

            <h1 className="display-hero max-w-[22ch] text-huge leading-[1.04]">
              <span className="block">{hero.headline.before}</span>
              <span className="block text-accent">{hero.headline.emphasis}</span>
            </h1>

            <p className="lede max-w-[36rem]">{hero.lede}</p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Link className="btn btn-primary" href={startHref}>
                {hero.primary}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </Link>
              <DemoLink className="btn btn-quiet">{hero.demo}</DemoLink>
              <a className="btn btn-quiet" href={site.repository}>
                {hero.source}
              </a>
            </div>

            <CommandLine command={scaffoldCommand} />

            <ul aria-label="In short" className="facts">
              {hero.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>

          <figure aria-label={devices.label} className="flex flex-col gap-3">
            <div className="devices">
              <SchemeScreenshot dark={board.dark} light={board.light} priority />
              <SchemeScreenshot
                className="devices-phone"
                dark={shots.threadMobile.dark}
                light={shots.threadMobile.light}
              />
            </div>
            <figcaption className="text-micro leading-[1.5] text-fg-subtle text-pretty">
              {hero.caption}
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-5">
            <p className="eyebrow">{keeps.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{keeps.heading}</h2>
            <p className="text-fg-muted text-pretty">{keeps.lede}</p>
            <p className="text-fg text-pretty">{keeps.body}</p>
            <div className="flex flex-col gap-1.5 border-l-2 border-accent pl-4">
              <p className="font-medium text-fg">{keeps.aside.heading}</p>
              <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
                {keeps.aside.body}
              </p>
            </div>
          </div>

          <div className="compare lg:pt-1">
            {keeps.columns.map((column) => (
              <div key={column.title}>
                <p className="eyebrow">{column.title}</p>
                <ul>
                  {column.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">{ownership.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">{ownership.heading}</h2>
            <p className="mt-4 text-fg-muted text-pretty">{ownership.lede}</p>
          </header>

          <div className="card-grid pillars mt-10 sm:grid-cols-2">
            {ownership.pillars.map((pillar, index) => (
              <Link href={docHref(pillar.doc)} key={pillar.id}>
                <p className="font-mono text-micro tracking-[0.12em] text-fg-subtle">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg">
                  {pillar.title}
                </h3>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{pillar.body}</p>
                <p className="mt-auto pt-4 font-mono text-micro text-fg-subtle">
                  <span className="card-arrow">{pillar.link} →</span>
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-20">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-[46rem]">
              <p className="eyebrow">{audiencesBand.eyebrow}</p>
              <h2 className="display mt-3 text-large leading-[1.15]">{audiencesBand.heading}</h2>
              <p className="mt-4 text-fg-muted text-pretty">{audiencesBand.lede}</p>
            </div>
            <Link className="textlink text-micro shrink-0" href={audienceIndexHref}>
              {audiencesBand.link}
            </Link>
          </header>

          <div className="mt-10">
            <AudienceCards audiences={primaryAudiences} />
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-center">
          <div className="flex max-w-[40rem] flex-col gap-5">
            <p className="eyebrow">{developerTeaser.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{developerTeaser.heading}</h2>
            <p className="text-fg-muted text-pretty">{developerTeaser.body}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link className="btn" href={audienceHref('developers')}>
                {developerTeaser.link}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </Link>
              <Link className="textlink text-micro" href={docHref('configuration')}>
                Configuration in code
              </Link>
            </div>
          </div>

          <Terminal content={devTerminal} />
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-center">
          <div className="flex flex-col gap-5">
            <p className="eyebrow">{performance.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{performance.heading}</h2>
            <p className="text-fg-muted text-pretty">{performance.lede}</p>
            <p className="border-l-2 border-accent pl-4 text-fg text-pretty">
              {performance.evidence(facts)}
            </p>
            <p className="text-micro leading-[1.65] text-fg-subtle text-pretty">
              {performance.method(facts)}
            </p>
            <p>
              <Link className="textlink text-micro" href={docHref('performance')}>
                {performance.link}
              </Link>
            </p>
          </div>

          <SchemeScreenshot dark={shots.search.dark} light={shots.search.light} />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">{themes.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">{themes.heading}</h2>
            <p className="mt-4 text-fg-muted text-pretty">{themes.lede}</p>
          </header>

          <div className="mt-10">
            <ThemeShowcase />
          </div>

          <dl className="mt-12 grid gap-x-8 gap-y-6 border-t border-border pt-8 sm:grid-cols-2 lg:grid-cols-4">
            {customisation.points.map((point) => (
              <div className="flex flex-col gap-1.5" key={point.title}>
                <dt className="font-semibold tracking-[-0.01em] text-fg">{point.title}</dt>
                <dd className="text-micro leading-[1.65] text-fg-muted text-pretty">
                  {point.body}
                </dd>
                <dd className="mt-1">
                  <Link className="textlink text-micro" href={docHref(point.doc)}>
                    {point.link}
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-center">
          <div className="flex max-w-[40rem] flex-col gap-5">
            <p className="eyebrow">{openSource.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{openSource.heading}</h2>
            <p className="text-fg-muted text-pretty">{openSource.body}</p>
            <ul className="facts">
              {openSource.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <DocLinks
              links={[...openSource.links, { label: openSource.licenceLink, href: licenceHref }]}
            />
          </div>

          <Terminal />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center">
          <SchemeScreenshot dark={shots.dues.dark} light={shots.dues.light} />

          <div className="flex flex-col gap-5">
            <p className="eyebrow">{memberships.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{memberships.heading}</h2>
            <p className="text-fg-muted text-pretty">{memberships.body}</p>
            <p className="text-fg text-pretty">{memberships.emphasis}</p>
            <p>
              <Link className="textlink text-micro" href={docHref('membership-guide')}>
                {memberships.link}
              </Link>
            </p>
          </div>
        </div>
      </section>

      <ClosingBand body={closing.body} heading={closing.heading} startHref={startHref} />
    </>
  )
}
