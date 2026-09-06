import { cn } from './utils'
import { navTabListVariants, navTabVariants } from './variants'

export interface NavTab {
  readonly href: string
  readonly label: string
  readonly isCurrent: boolean
  readonly count?: number
}

export function NavTabs({
  label,
  tabs,
  aside,
  className,
}: {
  label: string
  tabs: readonly NavTab[]
  aside?: React.ReactNode
  className?: string
}) {
  if (tabs.length === 0) return null

  return (
    <nav
      aria-label={label}
      className={cn('flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2', className)}
    >
      <ul data-nav-tabs className={navTabListVariants()}>
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <a
              href={tab.href}
              {...(tab.isCurrent ? { 'aria-current': 'page' as const } : {})}
              className={navTabVariants({ active: tab.isCurrent })}
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
