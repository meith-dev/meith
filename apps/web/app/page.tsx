import Link from "next/link"

import { AudiencePicker } from "../src/components/audience-picker"
import { CopyCommand } from "../src/components/copy-command"
import { Terminal } from "../src/components/terminal"
import { readFacts } from "../src/content/facts"
import {
  alongside,
  capabilities,
  closing,
  deployment,
  documentation,
  dues,
  hero,
  installCommand,
  licence,
  licenceHref,
  licensing,
  losses,
  migration,
  performance,
  site,
} from "../src/content/site"
import { docHref, documentsInSection, sections } from "../src/docs/registry"

export default async function LandingPage() {
  const facts = await readFacts()
  const running = sections.find((section) => section.id === "running")
  const quickstart = running ? documentsInSection(running.id).find((doc) => doc.primary) : undefined
  const startHref = quickstart ? docHref(quickstart.slug) : "/docs"

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell grid gap-x-14 gap-y-14 pt-16 pb-20 sm:pt-24 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
          <div className="flex flex-col items-start gap-6">
            <p className="badge">
              <span aria-hidden className="badge-dot" />
              {hero.badge}
            </p>

            {/*
              Two sentences, and the break between them is explicit rather than
              left to `text-wrap: balance` — balance optimises for even line
              lengths and does not know a full stop from a comma, so it happily
              set "forgets. Your" as a line and buried the turn the headline is
              built on. The measure is narrow enough that each sentence takes
              two lines of its own, which is the rhythm this one wants.
            */}
            <h1 className="display-hero max-w-[15ch] text-hero leading-[1.02]">
              {hero.headline.before}
              <br />
              <span className="text-accent">{hero.headline.emphasis}</span>
            </h1>

            <p className="lede max-w-[36rem]">{hero.lede}</p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href={site.demo}>
                {hero.primary}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </a>
              <Link className="btn btn-quiet" href={startHref}>
                {hero.secondary}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <CopyCommand command={installCommand} />
              <a className="textlink text-micro" href={site.repository}>
                Read the source
              </a>
            </div>

            <p className="max-w-[34rem] text-micro leading-[1.5] text-fg-subtle text-pretty">
              {hero.assurance}
            </p>
          </div>

          <AudiencePicker />
        </div>
      </section>

      <section aria-label="What keeps happening" className="border-b border-border bg-surface">
        <div className="shell py-14 sm:py-18">
          <div className="card-grid sm:grid-cols-2">
            {losses.map((loss) => (
              <div key={loss.complaint}>
                <h2 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg text-balance">
                  “{loss.complaint}”
                </h2>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{loss.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">{alongside.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{alongside.heading}</h2>
            <p className="text-fg-muted text-pretty">{alongside.lede}</p>
          </header>

          <div className="grid gap-6 sm:grid-cols-2 lg:pt-1">
            {alongside.columns.map((column, index) => (
              <div key={column.title} className="flex flex-col gap-3">
                <p className="eyebrow">{column.title}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {column.items.map((item) => (
                    <li key={item} className={index === 0 ? "tag" : "tag tag-strong"}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-24">
          <header className="max-w-[46rem]">
            <p className="eyebrow">What you get</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              Everything a community needs to feel at home.
            </h2>
            <p className="mt-4 text-fg-muted text-pretty">
              Six things your members and moderators will actually notice, and how each one is
              done. Each is also a link, because the page asserts and the document argues.
            </p>
          </header>

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

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-8 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">{dues.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{dues.heading}</h2>
          </header>

          <div className="flex max-w-[36rem] flex-col gap-6 lg:pt-1">
            <p className="text-fg-muted text-pretty">{dues.lede}</p>

            <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {dues.points.map((point) => (
                <div key={point.title}>
                  <dt className="font-medium text-fg">{point.title}</dt>
                  <dd className="mt-1 text-micro leading-[1.65] text-fg-muted text-pretty">
                    {point.body}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="border-l-2 border-accent pl-4 text-fg text-pretty">{dues.emphasis}</p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link className="textlink text-micro" href={docHref("plugin-api")}>
                {dues.link}
              </Link>
              <a className="textlink text-micro" href={`${site.repository}/tree/main/plugins/dues`}>
                {dues.readme}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-24">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_27rem] lg:items-center">
            <header className="max-w-[44rem]">
              <p className="eyebrow">{deployment.eyebrow}</p>
              <h2 className="display mt-3 text-large leading-[1.15]">{deployment.heading}</h2>
              <p className="mt-4 text-fg-muted text-pretty">{deployment.lede}</p>
            </header>

            <div className="flex flex-col gap-3">
              <Terminal />
              <p className="text-micro leading-[1.5] text-fg-subtle text-pretty">
                The whole job, by hand. The guided route is the same four containers, with the
                panel typing the secrets in for you.
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
                <p className="pt-3">
                  <Link className="textlink text-micro" href={docHref(option.action.doc)}>
                    {option.action.label}
                  </Link>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-x-10 gap-y-3 border-t border-border pt-6 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <p className="eyebrow lg:pt-1">{deployment.cost.title}</p>
            <div className="flex max-w-[40rem] flex-col gap-3">
              <p className="text-fg-muted text-pretty">{deployment.cost.body}</p>
              <p className="text-fg text-pretty">{deployment.cost.emphasis}</p>
              <p>
                <Link className="textlink text-micro" href={docHref("operating")}>
                  {deployment.link}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-12 py-14 sm:py-18 lg:grid-cols-2">
          <div className="flex max-w-[34rem] flex-col gap-4">
            <p className="eyebrow">{performance.eyebrow}</p>
            <h2 className="display text-mid leading-[1.2]">{performance.heading}</h2>
            <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{performance.lede}</p>
            <p className="text-micro leading-[1.65] text-fg-subtle text-pretty">
              {performance.evidence(facts)}
            </p>
            <p className="mt-auto pt-1">
              <Link className="textlink text-micro" href={docHref("performance")}>
                {performance.link}
              </Link>
            </p>
          </div>

          <div className="flex max-w-[34rem] flex-col gap-4">
            <p className="eyebrow">{migration.eyebrow}</p>
            <h2 className="display text-mid leading-[1.2]">{migration.heading}</h2>
            <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{migration.body}</p>
            <p className="text-micro leading-[1.65] text-fg-subtle text-pretty">
              {migration.emphasis}
            </p>
            <p className="mt-auto pt-1">
              <Link className="textlink text-micro" href={docHref("mybb-parity")}>
                {migration.link}
              </Link>
            </p>
          </div>
        </div>
      </section>

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

      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="hero-glow" />
        <div className="shell grid gap-x-14 gap-y-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
          <div className="flex flex-col items-start gap-6">
            <h2 className="display max-w-[22ch] text-large leading-[1.12]">{closing.heading}</h2>
            <p className="max-w-[36rem] text-fg-muted text-pretty">{closing.body}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Link className="btn btn-primary" href={startHref}>
                {closing.action}
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
