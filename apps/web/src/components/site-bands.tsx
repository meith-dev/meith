import Link from 'next/link'

import { docHref } from '../docs/registry'
import { ForumLink } from './forum-link'

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
    <section className="marketing-closing">
      <div className="shell">
        <div>
          <p className="eyebrow">A little space. A lot of possibility.</p>
          <h2>{heading}</h2>
          <p>{body}</p>
        </div>
        <div className="marketing-actions">
          <Link className="btn btn-primary" href={startHref}>
            Get started <span aria-hidden>↗</span>
          </Link>
          {docsHref === undefined ? (
            <ForumLink className="btn btn-quiet">
              Meet the community <span aria-hidden>↗</span>
            </ForumLink>
          ) : (
            <Link className="btn btn-quiet" href={docsHref}>
              Explore the docs <span aria-hidden>↗</span>
            </Link>
          )}
        </div>
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
    <div className="marketing-doclinks flex flex-wrap items-center gap-x-6 gap-y-2">
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
