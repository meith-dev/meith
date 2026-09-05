import Link from 'next/link'

import { closing, scaffoldCommand, site } from '../content/site'
import { docHref } from '../docs/registry'
import { CommandLine } from './command-line'
import { DemoLink } from './demo-link'

export function ClosingBand({
  heading,
  body,
  startHref,
  docsHref,
}: {
  heading: string
  body: string
  startHref: string
  docsHref?: string
}) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="hero-glow" />
      <div className="shell grid gap-x-14 gap-y-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div className="flex flex-col items-start gap-6">
          <h2 className="display max-w-[22ch] text-large leading-[1.12]">{heading}</h2>
          <p className="max-w-[36rem] text-fg-muted text-pretty">{body}</p>
          <CommandLine command={scaffoldCommand} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link className="btn btn-primary" href={startHref}>
              {closing.action}
              <span aria-hidden className="btn-arrow">
                →
              </span>
            </Link>
            {docsHref === undefined ? (
              <DemoLink className="btn btn-quiet">{closing.demo}</DemoLink>
            ) : (
              <Link className="btn btn-quiet" href={docsHref}>
                Read the docs
              </Link>
            )}
            <a className="btn btn-quiet" href={site.repository}>
              {closing.source}
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
  )
}

export function Breadcrumb({
  trail,
  current,
}: {
  readonly trail: readonly { readonly label: string; readonly href: string }[]
  readonly current: string
}) {
  return (
    <nav aria-label="Breadcrumb" className="eyebrow">
      {trail.map((crumb) => (
        <span key={crumb.href}>
          <Link className="transition-colors hover:text-fg" href={crumb.href}>
            {crumb.label}
          </Link>
          <span aria-hidden className="px-1.5">
            /
          </span>
        </span>
      ))}
      <span aria-current="page">{current}</span>
    </nav>
  )
}

export function DocLinks({
  links,
}: {
  readonly links: readonly (
    | { readonly label: string; readonly href: string }
    | { readonly label: string; readonly doc: string }
  )[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {links.map((link) =>
        'doc' in link ? (
          <Link className="textlink text-micro" href={docHref(link.doc)} key={link.label}>
            {link.label}
          </Link>
        ) : (
          <a className="textlink text-micro" href={link.href} key={link.label}>
            {link.label}
          </a>
        ),
      )}
    </div>
  )
}
