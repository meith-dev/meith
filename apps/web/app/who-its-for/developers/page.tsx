import type { Metadata } from 'next'
import Link from 'next/link'

import { AudienceCards } from '../../../src/components/audience-cards'
import { CommandLine } from '../../../src/components/command-line'
import { Breadcrumb, ClosingBand, DocLinks } from '../../../src/components/site-bands'
import { Terminal } from '../../../src/components/terminal'
import { ThemeShowcase } from '../../../src/components/theme-showcase'
import { developers } from '../../../src/content/developers'
import { findScenario, readFacts } from '../../../src/content/facts'
import { audienceHref, audienceIndexHref, audiences } from '../../../src/content/segments'
import { devTerminal, scaffoldCommand, site, terminal, themes } from '../../../src/content/site'
import { docHref, quickstartHref } from '../../../src/docs/registry'
import { ogImage } from '../../../src/og/card'

const canonical = audienceHref(developers.slug)

export const metadata: Metadata = {
  title: { absolute: developers.meta.title },
  description: developers.meta.description,
  alternates: { canonical },
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: developers.meta.title,
    description: developers.meta.description,
    url: `${site.url}${canonical}`,
    images: ogImage(`${audienceIndexHref}/og/${developers.slug}`, developers.meta.title),
  },
  twitter: {
    card: 'summary_large_image',
    title: developers.meta.title,
    description: developers.meta.description,
  },
}

export default async function DevelopersPage() {
  const facts = await readFacts()
  const startHref = quickstartHref()
  const others = audiences.filter((audience) => audience.slug !== developers.slug)
  const scenarios = developers.performance.scenarios.map((page) =>
    findScenario(facts.performance, page),
  )

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell grid gap-x-14 gap-y-12 pt-14 pb-20 sm:pt-20 sm:pb-24 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
          <div className="flex flex-col items-start gap-6">
            <Breadcrumb
              current={developers.name}
              trail={[
                { label: site.name, href: '/' },
                { label: 'Who it’s for', href: audienceIndexHref },
              ]}
            />

            <p className="badge">
              <span aria-hidden className="badge-dot" />
              {developers.hero.badge}
            </p>

            <h1 className="display-hero max-w-[20ch] text-huge leading-[1.06]">
              <span className="block">{developers.hero.headline.before}</span>
              <span className="block text-accent">{developers.hero.headline.emphasis}</span>
            </h1>

            <p className="lede max-w-[36rem]">{developers.hero.lede}</p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Link className="btn btn-primary" href={startHref}>
                Get started
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </Link>
              <a className="btn btn-quiet" href={site.repository}>
                View on GitHub
              </a>
            </div>

            <CommandLine command={scaffoldCommand} />
          </div>

          <Terminal content={devTerminal} />
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-6 py-14 sm:py-16 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-baseline">
          <h2 className="display text-large leading-[1.15]">{developers.intro.heading}</h2>
          <p className="max-w-[38rem] text-fg-muted text-pretty lg:pt-1">{developers.intro.body}</p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">{developers.repository.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              {developers.repository.heading}
            </h2>
            <p className="mt-4 text-fg-muted text-pretty">{developers.repository.lede}</p>
          </header>

          <div className="card-grid mt-10 sm:grid-cols-2 lg:grid-cols-4">
            {developers.repository.points.map((point, index) => (
              <div key={point.title}>
                <p className="font-mono text-micro tracking-[0.12em] text-fg-subtle">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg">
                  {point.title}
                </h3>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{point.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <DocLinks links={developers.repository.links} />
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-center">
          <div className="flex max-w-[40rem] flex-col gap-5">
            <p className="eyebrow">{developers.experience.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{developers.experience.heading}</h2>
            <p className="text-fg-muted text-pretty">{developers.experience.body}</p>
            <DocLinks links={[developers.experience.link]} />
          </div>

          <Terminal content={devTerminal} />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell py-16 sm:py-20">
          <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-end">
            <header className="max-w-[40rem]">
              <p className="eyebrow">{developers.extensibility.eyebrow}</p>
              <h2 className="display mt-3 text-large leading-[1.15]">
                {developers.extensibility.heading}
              </h2>
              <p className="mt-4 text-fg-muted text-pretty">{developers.extensibility.lede}</p>
            </header>

            <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4 lg:grid-cols-2">
              {developers.extensibility.counts(facts).map((entry) => (
                <div key={entry.label}>
                  <dt className="eyebrow">{entry.label}</dt>
                  <dd className="mt-1 font-mono text-huge leading-none text-fg">{entry.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card-grid mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {developers.extensibility.points.map((point) => (
              <Link href={docHref(point.doc)} key={point.title}>
                <h3 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg">
                  {point.title}
                </h3>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{point.body}</p>
                <p className="mt-auto pt-4 font-mono text-micro text-fg-subtle">
                  <span className="card-arrow">{point.link} →</span>
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">Themes</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              Your community should not look like everyone else’s install.
            </h2>
            <p className="mt-4 text-fg-muted text-pretty">
              A theme is code: a package in the repository that fills documented slots with typed
              view models, reviewed and deployed like everything else. Five ship with the board,
              each in light and dark.
            </p>
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

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-5">
            <p className="eyebrow">{developers.performance.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{developers.performance.heading}</h2>
            <p className="text-fg-muted text-pretty">{developers.performance.lede}</p>
            <p className="text-micro leading-[1.65] text-fg-subtle text-pretty">
              {developers.performance.note}
            </p>
            <DocLinks links={[developers.performance.link]} />
          </div>

          <div className="flex flex-col gap-8 lg:pt-1">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {developers.performance.method(facts).map((entry) => (
                <div key={entry.label}>
                  <dt className="eyebrow">{entry.label}</dt>
                  <dd className="mt-1 text-micro text-fg">{entry.value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="eyebrow mb-3">Measured p95 against budget</p>
              <dl>
                {scenarios.map((scenario) => (
                  <div className="measure-row" key={scenario.page}>
                    <dt>{scenario.page}</dt>
                    <dd>
                      <b>{scenario.p95Ms} ms</b>
                    </dd>
                    <dd>of {scenario.budgetMs} ms</dd>
                    <dd aria-hidden className="measure-bar">
                      <span style={{ width: `${Math.max(scenario.used, 1)}%` }} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">{developers.selfHosting.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{developers.selfHosting.heading}</h2>
            <p className="text-fg-muted text-pretty">{developers.selfHosting.lede}</p>
          </header>

          <div className="flex flex-col gap-8 lg:pt-1">
            <div className="grid gap-6 sm:grid-cols-3">
              {developers.selfHosting.points.map((point) => (
                <div className="flex flex-col gap-2" key={point.title}>
                  <h3 className="font-semibold tracking-[-0.01em] text-fg">{point.title}</h3>
                  <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
                    {point.body}
                  </p>
                </div>
              ))}
            </div>
            <Terminal content={terminal} />
            <DocLinks links={developers.selfHosting.links} />
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-6 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">{developers.openSource.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{developers.openSource.heading}</h2>
          </header>
          <div className="flex max-w-[38rem] flex-col gap-6 lg:pt-1">
            <p className="text-fg-muted text-pretty">{developers.openSource.body}</p>
            <p>
              <a className="btn" href={site.repository}>
                {developers.openSource.link}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </a>
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">Not quite you?</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              The same software, from where you are standing.
            </h2>
          </header>

          <div className="mt-10">
            <AudienceCards audiences={others} columns="lg:grid-cols-4" />
          </div>
        </div>
      </section>

      <ClosingBand
        body={developers.closing.body}
        docsHref="/docs"
        heading={developers.closing.heading}
        startHref={startHref}
      />
    </>
  )
}
