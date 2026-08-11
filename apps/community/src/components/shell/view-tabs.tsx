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
    <nav aria-label={label} className={cn('flex items-center gap-x-3', className)}>
      <ul className="-my-1.5 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1.5">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <a
              href={tab.href}
              {...(tab.isCurrent ? { 'aria-current': 'page' as const } : {})}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                tab.isCurrent
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-xs font-semibold tabular-nums',
                    tab.isCurrent ? 'bg-primary-foreground/20' : 'bg-secondary',
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
