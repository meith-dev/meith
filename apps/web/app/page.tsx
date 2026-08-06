import Link from "next/link"

import { BoardPreview } from "../src/components/board-preview"
import { CopyCommand } from "../src/components/copy-command"
import { Terminal } from "../src/components/terminal"
import { findScenario, readFacts } from "../src/content/facts"
import {
  capabilities,
  closing,
  deployment,
  documentation,
  hero,
  installCommand,
  licence,
  licenceHref,
  licensing,
  migration,
  performance,
  proof,
  site,
} from "../src/content/site"
import { docHref, documentsInSection, sections } from "../src/docs/registry"
import { compact, group } from "../src/format"

/**
 * The landing page.
 *
 * Eight bands, each answering one question somebody actually asks. What is it (a
 * picture of a board, not a paragraph about one). Is it any good (measured
 * numbers, from the load runner, with the budget beside them). What does it
 * actually do. Where does it run, and what does running it look like. What about
 * the board I am already on. What is the licence. Where do I read more.
 *
 * There were nine. The band that went was the one explaining the name — the
 * meitheal, the proverb, the two paragraphs of etymology — and it went because
 * it was the page's *third* band and the reader's *last* question. What it is
 * named after is a good story for somebody who has already decided to run this;
 * for everybody else it was three screens between "what is this" and "does it
 * hold up". The band about where it runs picked up the transcript that its
 * removal made room for.
 *
 * Every word comes from `src/content/site.ts`, every document link from the
 * manifest, and every *figure* from `src/content/facts.ts`, which reads the
 * generated references at build time rather than trusting anybody to retype a
 * number that changed.
 */
export default async function LandingPage() {
  const facts = await readFacts()
  const running = sections.find((section) => section.id === "running")
  const quickstart = running ? documentsInSection(running.id).find((doc) => doc.primary) : undefined
  const startHref = quickstart ? docHref(quickstart.slug) : "/docs"
  const stats = proof(facts)
  const featured = performance.featured.map((page) => findScenario(facts.performance, page))

  return (
    <>
      {/* ── the hero ─────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-border">
        {/*
          Two divs and no JavaScript, where the old page ran a canvas: a ruled
          grid, masked so it is gone by the foot of the band, under a soft wash
          of the accent behind the headline.
        */}
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell grid gap-x-14 gap-y-14 pt-16 pb-20 sm:pt-24 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-center">
          <div className="flex flex-col items-start gap-6">
            <p className="badge">
              <span aria-hidden className="badge-dot" />
              {hero.badge}
            </p>

            <h1 className="display-hero max-w-[15ch] text-hero leading-[1.02]">
              {hero.headline.before}
              <span className="text-accent">{hero.headline.emphasis}</span>
            </h1>

            <p className="lede max-w-[36rem]">{hero.lede}</p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Link className="btn btn-primary" href={startHref}>
                {hero.primary}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </Link>
              <Link className="btn btn-quiet" href="/docs">
                {hero.secondary}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <CopyCommand command={installCommand} />
              <a className="textlink text-micro" href={site.repository}>
                Read the source
              </a>
            </div>

            <p className="max-w-[32rem] text-micro leading-[1.5] text-fg-subtle text-pretty">
              {hero.assurance}
            </p>
          </div>

          <BoardPreview />
        </div>
      </section>

      {/* ── the figures ──────────────────────────────────────────────── */}
      <section aria-label="By the numbers" className="border-b border-border bg-surface">
        <div className="shell grid gap-x-10 gap-y-8 py-10 sm:grid-cols-2 sm:py-12 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-2">
              <p className="stat-value">{stat.value}</p>
              <p className="max-w-[18rem] text-micro leading-[1.5] text-fg-muted text-pretty">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── what it does ─────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="shell py-16 sm:py-24">
          <header className="max-w-[46rem]">
            <p className="eyebrow">What you get</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              Six decisions you would otherwise be living with.
            </h2>
            <p className="mt-4 text-fg-muted text-pretty">
              Each one is a thing that goes wrong on a board eventually, and what this one does
              about it. Each is also a link, because the page asserts and the document argues.
            </p>
          </header>

          {/*
            The whole card is the link, not the four words at the bottom of it.
            The lift on hover is what says so.
          */}
          <div className="card-grid mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability, index) => (
              <Link
                key={capability.title}
                href={docHref(capability.doc, capability.anchor ?? undefined)}
              >
                <p className="font-mono text-micro tracking-[0.12em] text-fg-subtle">
                  {String(index + 1).padStart(2, "0")}
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

      {/* ── where it runs ────────────────────────────────────────────── */}
      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-24">
          {/*
            The header and the transcript share a row, and the two routes run
            full width underneath. The other way round — cards beside the
            transcript — makes two narrow columns of eight lines each next to a
            window of four, and leaves the bottom right of the band empty.
          */}
          <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_27rem] lg:items-center">
            <header className="max-w-[44rem]">
              <p className="eyebrow">{deployment.eyebrow}</p>
              <h2 className="display mt-3 text-large leading-[1.15]">{deployment.heading}</h2>
              <p className="mt-4 text-fg-muted text-pretty">{deployment.lede}</p>
            </header>

            <div className="flex flex-col gap-3">
              <Terminal />
              <p className="text-micro leading-[1.5] text-fg-subtle text-pretty">
                The hand route, in full. The guided one is the same four containers, with the panel
                typing the secrets for you.
              </p>
            </div>
          </div>

          <div className="card-grid mt-12 sm:grid-cols-2">
            {deployment.options.map((option) => (
              <div key={option.title}>
                <h3 className="text-mid font-semibold tracking-[-0.02em] text-fg">{option.title}</h3>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{option.body}</p>
                <p className="mt-auto pt-3 font-mono text-micro leading-[1.5] text-fg-subtle">
                  {option.note}
                </p>
                {/*
                  Each card ends somewhere. The band used to carry one link under
                  both cards, which made the second card an assertion with
                  nowhere to check it.
                */}
                <p className="pt-3">
                  <Link className="textlink text-micro" href={docHref(option.action.doc)}>
                    {option.action.label}
                  </Link>
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6">
            <Link className="textlink text-micro" href={docHref("operating")}>
              {deployment.link}
            </Link>
          </p>
        </div>
      </section>

      {/* ── the measurements ─────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="shell py-16 sm:py-24">
          <header className="max-w-[46rem]">
            <p className="eyebrow">{performance.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">{performance.heading}</h2>
            <p className="mt-4 text-fg-muted text-pretty">{performance.lede}</p>
          </header>

          <div className="mt-10 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
            {/*
              The same table styling the documentation uses, because it is the
              same kind of claim: a column of numbers somebody may want to check
              against their own board. The bar is one series against one budget,
              so it needs no legend — the number is beside it, and the row names
              itself.
            */}
            <div className="doc-table perf-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Page</th>
                    <th scope="col">Measured p95</th>
                    <th scope="col">Budget</th>
                    <th scope="col">Of budget used</th>
                  </tr>
                </thead>
                <tbody>
                  {featured.map((scenario) => (
                    <tr key={scenario.page}>
                      <td>{scenario.page}</td>
                      <td className="font-mono">{scenario.p95Ms} ms</td>
                      <td className="font-mono">{scenario.budgetMs} ms</td>
                      <td>
                        <span className="flex items-center gap-3">
                          <span className="meter w-full min-w-16">
                            <span style={{ width: `${scenario.used}%` }} />
                          </span>
                          <span className="w-9 shrink-0 text-right font-mono">{scenario.used}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-5">
              <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
                {performance.aside}
              </p>
              <p className="text-micro leading-[1.65] text-fg-subtle text-pretty">
                Measured on {facts.performance.measured} against a board of{" "}
                {compact(facts.performance.posts)} posts in{" "}
                {compact(facts.performance.threads)} threads, the longest of them{" "}
                {group(facts.performance.longestThread)} posts.
              </p>
              <p>
                <Link className="textlink text-micro" href={docHref("performance")}>
                  {performance.link}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── the board you are already on ─────────────────────────────── */}
      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-6 py-14 sm:py-18 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow">{migration.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">{migration.heading}</h2>
          </div>
          <div className="flex max-w-[36rem] flex-col gap-4 lg:pt-1">
            <p className="text-fg-muted text-pretty">{migration.body}</p>
            <p className="text-fg text-pretty">{migration.emphasis}</p>
            <p>
              <Link className="textlink text-micro" href={docHref("mybb-parity")}>
                {migration.link}
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── the licence ──────────────────────────────────────────────── */}
      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-20">
          <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
            <div>
              <p className="eyebrow">{licensing.eyebrow}</p>
              <h2 className="display mt-3 text-large leading-[1.15]">{licensing.heading}</h2>
            </div>

            <div className="flex max-w-[36rem] flex-col gap-6 lg:pt-1">
              <p className="text-fg-muted text-pretty">{licensing.body}</p>

              <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
                {licensing.points.map((point) => (
                  <div key={point.title}>
                    <dt className="font-medium text-fg">{point.title}</dt>
                    <dd className="mt-1 text-micro leading-[1.65] text-fg-muted text-pretty">
                      {point.body}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="border-l-2 border-accent pl-4 text-fg text-pretty">
                {licensing.emphasis}
              </p>

              <div className="flex flex-col gap-2">
                <p>
                  <a className="textlink text-micro" href={licenceHref}>
                    {licensing.link} — {licence.name}
                  </a>
                </p>
                <p className="text-micro leading-[1.6] text-fg-subtle text-pretty">
                  {licensing.note}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── the documentation ────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="shell py-16 sm:py-24">
          <header className="max-w-[46rem]">
            <p className="eyebrow">{documentation.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">{documentation.heading}</h2>
            <p className="mt-4 text-fg-muted text-pretty">{documentation.lede}</p>
          </header>

          <div className="card-grid mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => {
              const primary = documentsInSection(section.id).find((doc) => doc.primary)
              if (!primary) return null
              return (
                <Link key={section.id} href={docHref(primary.slug)}>
                  <h3 className="text-mid font-semibold tracking-[-0.02em] text-fg">
                    {section.title}
                  </h3>
                  <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
                    {section.blurb}
                  </p>
                  <p className="mt-auto pt-4 font-mono text-micro text-fg-subtle">
                    <span className="card-arrow">Start with {primary.title} →</span>
                  </p>
                </Link>
              )
            })}
          </div>

          <p className="mt-8">
            <Link className="btn" href="/docs">
              All documents
              <span aria-hidden className="btn-arrow">
                →
              </span>
            </Link>
          </p>
        </div>
      </section>

      {/* ── the ask ──────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="hero-glow" />
        <div className="shell grid gap-x-14 gap-y-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
          <div className="flex flex-col items-start gap-6">
            <h2 className="display max-w-[24ch] text-large leading-[1.12]">{closing.heading}</h2>
            <p className="max-w-[36rem] text-fg-muted text-pretty">{closing.body}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Link className="btn btn-primary" href={startHref}>
                {hero.primary}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </Link>
              <CopyCommand command={installCommand} />
              <a className="btn btn-quiet" href={site.repository}>
                Source
              </a>
            </div>
          </div>

          {/*
            The question somebody has at exactly this point, answered where they
            have it rather than one click away in the quickstart.
          */}
          <dl className="flex flex-col gap-3 border-t border-border pt-5 lg:mt-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            {closing.requirements.map((requirement) => (
              <div key={requirement.label}>
                <dt className="eyebrow">{requirement.label}</dt>
                <dd className="mt-0.5 text-micro text-fg">{requirement.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}
