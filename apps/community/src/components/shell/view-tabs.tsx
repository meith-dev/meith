import { cn } from '@meith/ui'

export interface ViewTab {
  readonly href: string
  readonly label: string
  readonly isCurrent: boolean
  readonly count?: number
}

export function ViewTabs({
  label,
  tabs,
  aside,
  className,
}: {
  label: string
  tabs: readonly ViewTab[]
  aside?: React.ReactNode
  className?: string
}) {
  if (tabs.length === 0) return null

  return (
    <nav
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}
    >
      <ul className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <a
              href={tab.href}
              {...(tab.isCurrent ? { 'aria-current': 'page' as const } : {})}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                tab.isCurrent
                  ? 'bg-card font-semibold text-primary shadow-sm'
                  : 'font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    'rounded px-1.5 text-xs font-semibold tabular-nums',
                    tab.isCurrent
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>

      {aside !== undefined && (
        <span className="shrink-0 text-xs text-muted-foreground">{aside}</span>
      )}
    </nav>
  )
}
