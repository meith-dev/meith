import { buttonVariants, cn, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

export const PANEL_LIST =
  'flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-elevation'

export const PANEL_ROW =
  'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40'

export const PANEL_CARD =
  'flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-elevation'

export const PANEL_NOTE =
  'rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-elevation'

export function PanelList({
  children,
  className,
  label,
}: {
  readonly children: React.ReactNode
  readonly className?: string
  readonly label?: string
}) {
  return (
    <ul
      className={cn(PANEL_LIST, className)}
      {...(label === undefined ? {} : { 'aria-label': label })}
    >
      {children}
    </ul>
  )
}

export function PanelRow({
  title,
  meta,
  badges,
  actions,
  className,
}: {
  readonly title: React.ReactNode
  readonly meta?: React.ReactNode
  readonly badges?: React.ReactNode
  readonly actions?: React.ReactNode
  readonly className?: string
}) {
  return (
    <li className={cn(PANEL_ROW, className)}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          {badges}
        </span>
        {meta !== undefined && <span className="text-xs text-muted-foreground">{meta}</span>}
      </span>

      {actions !== undefined && (
        <span className="flex shrink-0 flex-wrap items-center gap-2 text-sm">{actions}</span>
      )}
    </li>
  )
}

export function PanelActionLink({
  href,
  children,
  variant = 'outline',
}: {
  readonly href: string
  readonly children: React.ReactNode
  readonly variant?: 'outline' | 'primary' | 'ghost'
}) {
  return (
    <a href={href} className={buttonVariants({ variant, size: 'sm' })}>
      {children}
    </a>
  )
}

export function PanelEmpty({
  title,
  description,
}: {
  readonly title: string
  readonly description?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-elevation">
      <Empty className="py-10">
        <EmptyTitle>{title}</EmptyTitle>
        {description !== undefined && <EmptyDescription>{description}</EmptyDescription>}
      </Empty>
    </div>
  )
}
