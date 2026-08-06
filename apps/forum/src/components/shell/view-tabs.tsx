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
      className={cn('flex items-center gap-x-4 border-b border-border', className)}
    >
      { }
      <ul className="-my-1.5 flex min-w-0 flex-1 items-center gap-x-4 overflow-x-auto py-1.5">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <a
              href={tab.href}
              {...(tab.isCurrent ? { 'aria-current': 'page' as const } : {})}
              className={cn(
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
