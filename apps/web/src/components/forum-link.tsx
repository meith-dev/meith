import type { ReactNode } from 'react'

import { site } from '../content/site'

export function ForumLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <a className={className} href={site.forum} rel="noreferrer" target="_blank">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
