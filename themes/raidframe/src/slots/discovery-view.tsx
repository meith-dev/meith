import type { DiscoveryViewModel, TabModel } from '@meith/theme-kit'

import { Frame, HEADING, MICRO, NUMERIC, RULE, Stamp } from '../shared'

const TAB =
  'inline-flex items-center border px-3 py-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] whitespace-nowrap'

const CURRENT = 'border-primary bg-primary text-primary-foreground'
const OTHER = 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary'

function Tabs({ label, tabs }: { label: string; tabs: readonly TabModel[] }) {
  if (tabs.length === 0) return null

  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center gap-1.5">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <a
              href={tab.href}
              {...(tab.isCurrent ? { 'aria-current': 'page' as const } : {})}
              className={`${TAB} ${tab.isCurrent ? CURRENT : OTHER}`}
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
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4"
    >
      <div className="border border-border bg-card shadow-elevation">
        <div className="px-4 py-3">
          <p className={MICRO}>listing</p>
          <h1 className={`${HEADING} text-xl text-foreground`}>{title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
        </div>
        <div className={RULE} aria-hidden="true" />
      </div>

      <Tabs label={tabsLabel} tabs={tabs} />

      {refusal !== null ? (
        <p
          role="alert"
          className="border border-l-[3px] border-border border-l-primary bg-card px-3 py-2 text-sm"
        >
          {refusal.message}{' '}
          <a href={refusal.signInHref} className="font-medium text-foreground hover:text-primary">
            {refusal.signInLabel}
          </a>
        </p>
      ) : rows.length === 0 ? (
        <Frame>
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        </Frame>
      ) : (
        <Frame>
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.threadId}
                className="flex flex-col gap-1.5 px-4 py-3 hover:bg-secondary/50 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <a
                    href={row.href}
                    className="truncate text-sm font-medium text-foreground hover:text-primary"
                  >
                    {row.title}
                  </a>
                  <p className={`${MICRO} truncate normal-case`}>
                    <a href={row.forum.href} className="uppercase hover:text-primary">
                      {row.forum.label}
                    </a>
                    <span className="text-border">{' | '}</span>
                    <span className="uppercase">started by</span> {row.authorUsername}
                  </p>
                </div>

                <p className={`${MICRO} shrink-0 normal-case sm:text-right`}>
                  <span className={`${NUMERIC} text-foreground`}>{row.replyCount}</span>{' '}
                  <span className="uppercase">{row.replyCount === 1 ? 'reply' : 'replies'}</span>
                  <span className="block">
                    <Stamp at={row.lastPostAt} />
                    {row.lastPostUsername === null ? null : ` by ${row.lastPostUsername}`}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </Frame>
      )}

      {nextHref !== null && (
        <p>
          <a href={nextHref} className={`${MICRO} hover:text-primary`}>
            {nextLabel} →
          </a>
        </p>
      )}
    </main>
  )
}
