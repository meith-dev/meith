import Link from 'next/link'

import { DemoLink } from '../src/components/demo-link'
import { SchemeScreenshot } from '../src/components/screenshot'
import { SegmentCards } from '../src/components/segment-cards'
import { ClosingBand } from '../src/components/site-bands'
import { Terminal } from '../src/components/terminal'
import { ThemeShowcase } from '../src/components/theme-showcase'
import { readFacts } from '../src/content/facts'
import {
  alongside,
  capabilities,
  chooser,
  closing,
  devices,
  devTerminal,
  extensible,
  finding,
  hero,
  licenceHref,
  memberships,
  openSource,
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

        <div className="shell grid gap-x-12 gap-y-10 pt-14 pb-16 sm:pt-20 sm:pb-20 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:items-center">
          <div className="flex max-w-[42rem] flex-col items-start gap-6">
            <p className="badge">
              <span aria-hidden className="badge-dot" />
              {hero.badge}
            </p>

            <h1 className="display-hero max-w-[20ch] text-huge leading-[1.06]">
              <span className="block">{hero.headline.before}</span>
              <span className="block text-accent">{hero.headline.emphasis}</span>
            </h1>

            <p className="lede max-w-[36rem]">{hero.lede}</p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <DemoLink className="btn btn-primary">
                {hero.primary}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </DemoLink>
              <Link className="btn btn-quiet" href={startHref}>
                {hero.secondary}
              </Link>
              <a className="textlink text-micro" href={site.repository}>
                Read the source
              </a>
            </div>
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

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-center">
          <div className="flex max-w-[40rem] flex-col gap-5">
            <p className="eyebrow">{extensible.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{extensible.heading}</h2>
            <p className="text-fg-muted text-pretty">{extensible.lede}</p>

            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              {extensible.counts(facts).map((entry) => (
                <div key={entry.label}>
                  <dt className="eyebrow">{entry.label}</dt>
                  <dd className="mt-1 font-mono text-mid text-fg">{entry.value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {extensible.links.map((link) => (
                <Link className="textlink text-micro" href={docHref(link.doc)} key={link.label}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <Terminal content={devTerminal} />
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-center">
          <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
              <p className="eyebrow">{finding.eyebrow}</p>
              <h2 className="display text-large leading-[1.15]">{finding.heading}</h2>
              <p className="text-fg-muted text-pretty">{finding.lede}</p>
            </header>

            <div className="flex flex-col gap-2 border-l-2 border-accent pl-4">
              <p className="font-medium text-fg">{finding.ranking.heading}</p>
              <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
                {finding.ranking.body}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-micro leading-[1.65] text-fg-subtle text-pretty">
                {finding.evidence(facts)}
              </p>
              <p>
                <Link className="textlink text-micro" href={docHref('performance')}>
                  {finding.link}
                </Link>
              </p>
            </div>
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

          <p className="mt-6">
            <Link className="textlink text-micro" href={docHref('themes')}>
              {themes.link}
            </Link>
          </p>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">{alongside.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{alongside.heading}</h2>
            <p className="text-fg-muted text-pretty">{alongside.lede}</p>
          </header>

          <div className="grid gap-6 sm:grid-cols-2 lg:pt-1">
            {alongside.columns.map((column, index) => (
              <div className="flex flex-col gap-3" key={column.title}>
                <p className="eyebrow">{column.title}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {column.items.map((item) => (
                    <li className={index === 0 ? 'tag' : 'tag tag-strong'} key={item}>
                      {item}
                    </li>
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
            <p className="eyebrow">What you get</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              Built for the people who actually run the place.
            </h2>
          </header>

          <div className="card-grid mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability, index) => (
              <Link
                href={docHref(capability.doc, capability.anchor ?? undefined)}
                key={capability.id}
              >
                <p className="font-mono text-micro tracking-[0.12em] text-fg-subtle">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg">
                  {capability.title}
                </h3>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
                  {capability.body}
                </p>
                <p className="mt-auto pt-4 font-mono text-micro text-fg-subtle">
                  <span className="card-arrow">{capability.link} →</span>
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-center">
          <div className="flex max-w-[40rem] flex-col gap-5">
            <p className="eyebrow">{openSource.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{openSource.heading}</h2>
            <p className="text-fg-muted text-pretty">{openSource.body}</p>
            <p className="border-l-2 border-accent pl-4 text-fg text-pretty">
              {openSource.emphasis}
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {openSource.links.map((link) => (
                <Link className="textlink text-micro" href={docHref(link.doc)} key={link.label}>
                  {link.label}
                </Link>
              ))}
              <a className="textlink text-micro" href={licenceHref}>
                {openSource.licenceLink}
              </a>
            </div>
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

      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">{chooser.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">{chooser.heading}</h2>
            <p className="mt-4 text-fg-muted text-pretty">{chooser.lede}</p>
          </header>

          <div className="mt-10">
            <SegmentCards />
          </div>
        </div>
      </section>

      <ClosingBand body={closing.body} heading={closing.heading} startHref={startHref} />
    </>
  )
}
