import type { ReactNode } from "react"

import { site } from "../content/site"

/*
 * Every link to the live board, in one place.
 *
 * They all open in a new tab, and that is the whole reason this is a component
 * rather than four `<a href={site.demo}>` scattered across the site. The demo
 * is the one link on here that a reader is meant to come *back* from: they go
 * to poke at a real board, and the argument for running one is on the page they
 * left. Replacing that page with the board is how a visit ends early.
 *
 * `rel="noreferrer"` rather than relying on the implicit `noopener` that
 * browsers now apply to `target="_blank"`, because the implicit one is recent
 * and this costs nothing.
 *
 * The hidden note is for a reader who cannot see a new tab appear. A link that
 * moves somebody somewhere they did not expect is disorienting when the
 * movement is invisible.
 */
export function DemoLink({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <a className={className} href={site.demo} rel="noreferrer" target="_blank">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
