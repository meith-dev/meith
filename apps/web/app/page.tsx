import Link from "next/link"

import { BoardSketch } from "../src/components/board-sketch"
import { CopyCommand } from "../src/components/copy-command"
import { FieldCanvas } from "../src/components/field-canvas"
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
  story,
} from "../src/content/site"
import { docHref, documentsInSection, sections } from "../src/docs/registry"
import { compact, group } from "../src/format"

export default async function LandingPage() {
  const facts = await readFacts()
  const running = sections.find((section) => section.id === "running")
  const quickstart = running ? documentsInSection(running.id).find((doc) => doc.primary) : undefined
  const startHref = quickstart ? docHref(quickstart.slug) : "/docs"
  const stats = proof(facts)
  const featured = performance.featured.map((page) => findScenario(facts.performance, page))

  return (
    <>
      { }
      <section className="relative isolate overflow-hidden border-b border-wall">
        <FieldCanvas />
        <div aria-hidden className="hero-wash" />
        <div className="shell grid gap-x-14 gap-y-12 pt-16 pb-20 sm:pt-24 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
          <div className="flex flex-col gap-6">
            <p className="eyebrow">{hero.eyebrow}</p>

            <h1 className="display max-w-[13ch] text-hero leading-[0.96] tracking-[-0.028em]">
              {hero.headline.before}
              <em className="text-gorse italic">{hero.headline.emphasis}</em>
            </h1>

            <p className="max-w-[34rem] text-mid leading-[1.45] text-ink-soft text-pretty">
              {hero.lede}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Link className="btn btn-primary" href={startHref}>
                {hero.primary}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </Link>
              <Link className="btn" href="/docs">
                {hero.secondary}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <CopyCommand command={installCommand} />
              <a className="textlink text-micro" href={site.repository}>
                Read the source
              </a>
            </div>

            <p className="max-w-[32rem] text-micro leading-[1.5] text-ink-faint text-pretty">
              {hero.assurance}
            </p>
          </div>

          <BoardSketch />
        </div>
      </section>

      { }
      <section aria-label="By the numbers" className="border-b border-wall bg-ground-deep">
        <div className="shell grid gap-x-10 gap-y-8 py-10 sm:grid-cols-2 sm:py-12 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-2">
              <p className="stat-value">{stat.value}</p>
              <p className="max-w-[18rem] text-micro leading-[1.5] text-ink-soft text-pretty">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      { }
      <section className="border-b border-wall">
        <div className="shell py-16 sm:py-24">
          <header className="max-w-[44rem]">
            <p className="eyebrow eyebrow-rule">What you get</p>
            <h2 className="display mt-4 text-large leading-[1.15]">
              Six decisions you would otherwise be living with.
            </h2>
            <p className="mt-4 text-ink-soft text-pretty">
              Each one is a thing that goes wrong on a board eventually, and what this one does
              about it. Each is also a link, because the page asserts and the document argues.
            </p>
          </header>

          { }
          <div className="cell-grid mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability, index) => (
              <Link
                key={capability.title}
                href={docHref(capability.doc, capability.anchor ?? undefined)}
              >
                <p className="font-mono text-micro tracking-[0.14em] text-gorse">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="font-display text-mid leading-[1.25] font-semibold tracking-[-0.01em] text-ink">
                  {capability.title}
                </h3>
                <p className="text-micro leading-[1.6] text-ink-soft text-pretty">
                  {capability.body}
                </p>
                <p className="mt-auto pt-3 font-mono text-micro tracking-[0.06em] text-ink-faint">
                  <span className="cell-arrow">{capability.link} →</span>
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      { }
      <section className="border-b border-wall bg-ground-deep">
        <div className="shell py-16 sm:py-24">
          <header className="max-w-[44rem]">
            <p className="eyebrow eyebrow-rule">{deployment.eyebrow}</p>
            <h2 className="display mt-4 text-large leading-[1.15]">{deployment.heading}</h2>
          </header>

          <div className="cell-grid mt-10 sm:grid-cols-2">
            {deployment.options.map((option) => (
              <div key={option.title}>
                <h3 className="font-display text-mid font-semibold tracking-[-0.01em] text-ink">
                  {option.title}
                </h3>
                <p className="text-micro leading-[1.6] text-ink-soft text-pretty">{option.body}</p>
                <p className="mt-auto pt-3 font-mono text-micro leading-[1.5] text-ink-faint">
                  {option.note}
                </p>
                { }
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

      { }
      <section className="border-b border-wall">
        <div className="shell py-16 sm:py-24">
          <header className="max-w-[44rem]">
            <p className="eyebrow eyebrow-rule">{performance.eyebrow}</p>
            <h2 className="display mt-4 text-large leading-[1.15]">{performance.heading}</h2>
            <p className="mt-4 text-ink-soft text-pretty">{performance.lede}</p>
          </header>

          <div className="mt-10 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
            { }
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
                          <span className="w-9 shrink-0 text-right font-mono">
                            {scenario.used}%
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-5">
              <p className="text-micro leading-[1.65] text-ink-soft text-pretty">
                {performance.aside}
              </p>
              <p className="text-micro leading-[1.65] text-ink-faint text-pretty">
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

      { }
      <section className="border-b border-wall">
        <div className="shell grid gap-x-14 gap-y-6 py-14 sm:py-18 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow eyebrow-rule">{migration.eyebrow}</p>
            <h2 className="display mt-4 text-large leading-[1.15]">{migration.heading}</h2>
          </div>
          <div className="flex max-w-[36rem] flex-col gap-4 lg:pt-1">
            <p className="text-ink-soft text-pretty">{migration.body}</p>
            <p className="text-ink text-pretty">{migration.emphasis}</p>
            <p>
              <Link className="textlink text-micro" href={docHref("mybb-parity")}>
                {migration.link}
              </Link>
            </p>
          </div>
        </div>
      </section>

      { }
      <section className="border-b border-wall bg-ground-deep">
        <div className="shell py-16 sm:py-20">
          <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
            <div>
              <p className="eyebrow eyebrow-rule">{licensing.eyebrow}</p>
              <h2 className="display mt-4 text-large leading-[1.15]">{licensing.heading}</h2>
            </div>

            <div className="flex max-w-[36rem] flex-col gap-6 lg:pt-1">
              <p className="text-ink-soft text-pretty">{licensing.body}</p>

              <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
                {licensing.points.map((point) => (
                  <div key={point.title}>
                    <dt className="text-ink">{point.title}</dt>
                    <dd className="mt-1 text-micro leading-[1.6] text-ink-soft text-pretty">
                      {point.body}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="border-l-2 border-gorse pl-4 text-ink text-pretty">
                {licensing.emphasis}
              </p>

              <div className="flex flex-col gap-2">
                <p>
                  <a className="textlink text-micro" href={licenceHref}>
                    {licensing.link} — {licence.name}
                  </a>
                </p>
                <p className="text-micro leading-[1.6] text-ink-faint text-pretty">
                  {licensing.note}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      { }
      <section className="border-b border-wall">
        <div className="shell py-16 sm:py-24">
          <p className="eyebrow eyebrow-rule">{story.eyebrow}</p>

          <p className="display mt-5 max-w-[26ch] text-large leading-[1.25] text-ink">
            {story.lead.before}
            <span className="font-display text-gorse italic">{story.lead.term}</span>
            {story.lead.after}
          </p>

          <div className="mt-8 grid max-w-[52rem] gap-x-12 gap-y-4 sm:grid-cols-2">
            {story.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-micro leading-[1.7] text-ink-soft text-pretty">
                {paragraph}
              </p>
            ))}
          </div>

          <blockquote className="mt-10 border-l-2 border-gorse pl-5">
            <p className="font-display text-mid text-gorse italic">{story.proverb}</p>
            <p className="mt-1 text-micro text-ink-faint">{story.translation}</p>
          </blockquote>
        </div>
      </section>

      { }
      <section className="border-b border-wall bg-ground-deep">
        <div className="shell py-16 sm:py-24">
          <header className="max-w-[44rem]">
            <p className="eyebrow eyebrow-rule">{documentation.eyebrow}</p>
            <h2 className="display mt-4 text-large leading-[1.15]">{documentation.heading}</h2>
            <p className="mt-4 text-ink-soft text-pretty">{documentation.lede}</p>
          </header>

          <div className="cell-grid mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => {
              const primary = documentsInSection(section.id).find((doc) => doc.primary)
              if (!primary) return null
              return (
                <Link key={section.id} href={docHref(primary.slug)}>
                  <h3 className="font-display text-mid font-semibold tracking-[-0.01em] text-ink">
                    {section.title}
                  </h3>
                  <p className="text-micro leading-[1.6] text-ink-soft text-pretty">
                    {section.blurb}
                  </p>
                  <p className="mt-auto pt-3 font-mono text-micro text-ink-faint">
                    <span className="cell-arrow">Start with {primary.title} →</span>
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

      { }
      <section>
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
          <div className="flex flex-col items-start gap-6">
            <h2 className="display max-w-[30ch] text-large leading-[1.15]">{closing.heading}</h2>
            <p className="max-w-[36rem] text-ink-soft text-pretty">{closing.body}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Link className="btn btn-primary" href={startHref}>
                {hero.primary}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </Link>
              <CopyCommand command={installCommand} />
              <a className="btn" href={site.repository}>
                Source
              </a>
            </div>
          </div>

          { }
          <dl className="flex flex-col gap-3 border-t border-wall pt-5 lg:mt-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            {closing.requirements.map((requirement) => (
              <div key={requirement.label}>
                <dt className="eyebrow">{requirement.label}</dt>
                <dd className="mt-0.5 text-micro text-ink">{requirement.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}
