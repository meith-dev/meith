/**
 * One row of views over the same page — "New posts / Today's posts / Unanswered",
 * "Inbox / Sent / Trash", "Latest / Top rated".
 *
 * ## The board had four of these and no two looked alike
 *
 * Discovery drew filled and outlined pills. The inbox drew bold text against
 * muted text over a rule. A forum's ordering drew an underline and a weight
 * change. Each was written where it was needed, each is defensible on its own,
 * and together they taught a member three different things about what "the one
 * you are looking at" looks like — on three pages they reach from the same
 * navigation bar.
 *
 * This is the one shape. Underlined tabs, because that is the widest
 * convention for switching views *within* a page and it is the lightest of the
 * three: a filled pill is the weight of a submit button, which is the wrong
 * promise for a link that re-renders the list you are already reading.
 *
 * ## They are links, and they carry `aria-current`
 *
 * A view is a URL — bookmarkable, shareable, and working with scripting off.
 * `aria-current="page"` is what says which one to a screen reader; the rule and
 * the weight are what say it to everybody else, and both are present because
 * neither alone reaches every reader.
 *
 * ## What it does not do
 *
 * It does not wrap gracefully past about five tabs: a second row of underlined
 * items under one shared rule reads as a broken table rather than as tabs. The
 * ACP's settings screen has nine groups and keeps its chips for that reason —
 * that row is a filter, not a tab bar, and the distinction is real.
 */

import { cn } from '@meith/ui'

export interface ViewTab {
  readonly href: string
  readonly label: string
  readonly isCurrent: boolean
  /** A count beside the label — unread messages, open reports. Omit for none. */
  readonly count?: number
}

export function ViewTabs({
  label,
  tabs,
  aside,
  className,
}: {
  /** The `<nav>`'s accessible name. Two tab rows on a page must not share one. */
  label: string
  tabs: readonly ViewTab[]
  /** Pushed to the trailing edge — a quota, a total. */
  aside?: React.ReactNode
  className?: string
}) {
  if (tabs.length === 0) return null

  return (
    <nav
      aria-label={label}
      className={cn('flex items-center gap-x-4 border-b border-border', className)}
    >
      <ul className="flex min-w-0 flex-1 items-center gap-x-4 overflow-x-auto">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <a
              href={tab.href}
              {...(tab.isCurrent ? { 'aria-current': 'page' as const } : {})}
              className={cn(
                /*
                 * `-mb-px` sits the item's own border on the container's rule
                 * rather than a pixel above it, so the current tab reads as
                 * part of the line instead of as a second line near it.
                 */
                '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 px-0.5 text-sm whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                tab.isCurrent
                  ? 'border-foreground font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {tab.count}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>

      {aside !== undefined && (
        <span className="shrink-0 pb-2 text-xs text-muted-foreground">{aside}</span>
      )}
    </nav>
  )
}
