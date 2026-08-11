import Link from "next/link"

import type { Facts } from "../content/facts"
import {
  closing as generalClosing,
  deployment,
  documentation,
  installCommand,
  licence,
  licenceHref,
  licensing,
  migration,
  performance,
  site,
} from "../content/site"
import { docHref, documentsInSection, sections } from "../docs/registry"
import { CopyCommand } from "./copy-command"
import { Terminal } from "./terminal"

/*
 * The bands that are the same wherever you landed.
 *
 * A segment page is a whole landing page, not a teaser — somebody arriving
 * cold from a search should never have to go to the general page to find out
 * what this costs, who runs it or what the licence means. That makes these
 * four bands appear on six pages, so they live here rather than being copied
 * into each one and drifting.
 */

export function RunningBand() {
  return (
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
              The whole job, by hand. The guided route is the same four containers, with the panel
              typing the secrets in for you.
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
  )
}

export function ProofBand({ facts }: { facts: Facts }) {
  return (
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
  )
}

export function LicenceBand() {
  return (
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
  )
}

export function DocsBand() {
  return (
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
  )
}

export function ClosingBand({
  heading,
  body,
  startHref,
}: {
  heading: string
  body: string
  startHref: string
}) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="hero-glow" />
      <div className="shell grid gap-x-14 gap-y-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div className="flex flex-col items-start gap-6">
          <h2 className="display max-w-[22ch] text-large leading-[1.12]">{heading}</h2>
          <p className="max-w-[36rem] text-fg-muted text-pretty">{body}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link className="btn btn-primary" href={startHref}>
              {generalClosing.action}
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
          {generalClosing.requirements.map((requirement) => (
            <div key={requirement.label}>
              <dt className="eyebrow">{requirement.label}</dt>
              <dd className="mt-0.5 text-micro text-fg">{requirement.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
