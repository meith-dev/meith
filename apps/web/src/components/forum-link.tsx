import type { ReactNode } from 'react'

import { site } from '../content/site'

export function ForumLink({
  children,
  className,
  href = site.forum,
}: {
  children: ReactNode
  className?: string
  href?: string
}) {
  return (
    <a className={className} href={href} rel="noreferrer" target="_blank">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
