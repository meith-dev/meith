import { cn } from '@meith/ui'
import type { DiscoveryViewModel, TabModel } from '@meith/theme-kit'

import { Chip, FEED, LINK, PAGE, PILL, Stamp, count, plural } from '../shared'

function Tabs({ label, tabs }: { label: string; tabs: readonly TabModel[] }) {
  if (tabs.length === 0) return null

  return (
    <nav
      aria-label={label}
      className="overflow-hidden rounded-lg border border-border bg-card shadow-elevation"
    >
      <ul className="flex overflow-x-auto">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <a
              href={tab.href}
              {...(tab.isCurrent ? { 'aria-current': 'page' as const } : {})}
              className={cn(
                'inline-flex h-11 items-center px-4 text-sm font-semibold whitespace-nowrap transition-colors',
                tab.isCurrent
                  ? 'border-b-2 border-primary text-primary'
                  : 'border-b-2 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
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
    <main id="board-content" tabIndex={-1} className={`${PAGE} flex-1 py-4 sm:py-6`}>
      <div className={`${FEED} flex flex-col gap-4`}>
        <header className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-elevation">
          <h1 className="text-xl leading-tight font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
        </header>

        <Tabs label={tabsLabel} tabs={tabs} />

        {refusal !== null ? (
          <p
            role="alert"
            className="rounded-lg border border-border bg-card px-4 py-3.5 text-sm shadow-elevation"
          >
            {refusal.message}{' '}
            <a href={refusal.signInHref} className={`font-semibold ${LINK}`}>
              {refusal.signInLabel}
            </a>
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground shadow-elevation">
            {emptyMessage}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li
                key={row.threadId}
                className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-elevation"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <a
                    href={row.href}
                    className="min-w-0 text-[0.9375rem] font-semibold hover:underline"
                  >
                    {row.title}
                  </a>
                  <Chip>
                    {count(row.replyCount)} {plural(row.replyCount, 'reply', 'replies')}
                  </Chip>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  in{' '}
                  <a href={row.forum.href} className={LINK}>
                    {row.forum.label}
                  </a>{' '}
                  · started by {row.authorUsername} · last post <Stamp at={row.lastPostAt} />
                  {row.lastPostUsername === null ? null : ` by ${row.lastPostUsername}`}
                </p>
              </li>
            ))}
          </ul>
        )}

        {nextHref !== null && (
          <a href={nextHref} className={PILL}>
            {nextLabel} →
          </a>
        )}
      </div>
    </main>
  )
}
