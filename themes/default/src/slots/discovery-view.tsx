import type { DiscoveryViewModel, TabModel } from '@meith/theme-kit'
import { Card, CardRows, cn, Empty, EmptyDescription } from '@meith/ui'

import { LINK, NUMERIC, pageAt, Stamp } from '../shared'

const TAB =
  'inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function Tabs({ label, tabs }: { label: string; tabs: readonly TabModel[] }) {
  if (tabs.length === 0) return null

  return (
    <nav aria-label={label} className="flex items-center gap-x-3">
      <ul className="-my-1.5 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1.5">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <a
              href={tab.href}
              {...(tab.isCurrent ? { 'aria-current': 'page' as const } : {})}
              className={cn(
                TAB,
                tab.isCurrent
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {tab.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function DiscoveryView({
  title,
  blurb,
  tabsLabel,
  tabs,
  rows,
  nextHref,
  nextLabel,
  emptyMessage,
  refusal,
}: DiscoveryViewModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={`${pageAt('max-w-4xl')} flex flex-1 flex-col gap-6 py-8`}
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{blurb}</p>
      </div>

      <Tabs label={tabsLabel} tabs={tabs} />

      {refusal !== null ? (
        <p role="alert" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {refusal.message}{' '}
          <a href={refusal.signInHref} className={`font-medium text-foreground ${LINK}`}>
            {refusal.signInLabel}
          </a>
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <Empty>
            <EmptyDescription>{emptyMessage}</EmptyDescription>
          </Empty>
        </Card>
      ) : (
        <Card>
          <CardRows>
            {rows.map((row) => (
              <li
                key={row.threadId}
                className="flex flex-col gap-1.5 px-4 py-3.5 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <a
                    href={row.href}
                    className="truncate text-[0.9375rem] font-semibold text-foreground hover:underline"
                  >
                    {row.title}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    in{' '}
                    <a href={row.forum.href} className="font-medium hover:underline">
                      {row.forum.label}
                    </a>{' '}
                    · started by {row.authorUsername}
                  </p>
                </div>

                <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
                  <span className={cn('font-semibold text-foreground', NUMERIC)}>
                    {row.replyCount}
                  </span>{' '}
                  {row.replyCount === 1 ? 'reply' : 'replies'}
                  <span className="block">
                    last post <Stamp at={row.lastPostAt} />
                    {row.lastPostUsername === null ? null : ` by ${row.lastPostUsername}`}
                  </span>
                </p>
              </li>
            ))}
          </CardRows>
        </Card>
      )}

      {nextHref !== null && (
        <a
          href={nextHref}
          className="inline-flex h-9 w-fit items-center rounded-full bg-secondary px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-accent"
        >
          {nextLabel} →
        </a>
      )}
    </main>
  )
}
