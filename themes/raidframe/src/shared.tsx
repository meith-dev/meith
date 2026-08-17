import type { ReactNode } from 'react'

import type { TimeModel, UserRefModel } from '@meith/theme-kit'

export const MICRO =
  'font-mono text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground'

export const HEADING = 'font-heading font-bold uppercase tracking-[0.12em]'

export const NUMERIC = 'font-mono tabular-nums'

export const LINK = 'text-foreground hover:text-primary'

export const MUTED_LINK = 'text-muted-foreground hover:text-primary'

export const BUTTON =
  'inline-flex items-center gap-1.5 border border-border bg-secondary px-3 py-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-secondary-foreground hover:border-primary/70 hover:text-primary'

export const BUTTON_PRIMARY =
  'inline-flex items-center gap-1.5 border border-primary bg-primary px-3 py-1.5 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-primary-foreground hover:bg-primary-hover hover:border-primary-hover'

export const CHIP =
  'inline-flex items-center gap-1 border border-border bg-surface px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.12em]'

export const RULE = 'h-px w-full bg-gradient-to-r from-primary/70 via-primary/15 to-transparent'

export function Frame({
  children,
  className,
  as: Element = 'section',
  ...rest
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
  'aria-labelledby'?: string
  'aria-label'?: string
}) {
  return (
    <Element
      {...rest}
      className={`relative border border-border bg-card text-card-foreground shadow-elevation ${className ?? ''}`}
    >
      <Corner className="-top-px -left-px border-t-2 border-l-2" />
      <Corner className="-top-px -right-px border-t-2 border-r-2" />
      <Corner className="-bottom-px -left-px border-b-2 border-l-2" />
      <Corner className="-right-px -bottom-px border-r-2 border-b-2" />
      {children}
    </Element>
  )
}

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 size-2 border-primary/70 ${className}`}
    />
  )
}

export function PanelHead({
  id,
  title,
  href,
  aside,
}: {
  id?: string
  title: string
  href?: string | null
  aside?: ReactNode
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
        <h2 id={id} className={`${HEADING} text-sm text-foreground`}>
          {href == null ? (
            title
          ) : (
            <a href={href} className="hover:text-primary">
              {title}
            </a>
          )}
        </h2>
        {aside}
      </div>
      <div className={RULE} aria-hidden="true" />
    </>
  )
}

export function ReadPip({ unread, className }: { unread: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-1.5 shrink-0 rotate-45 ${
        unread
          ? 'bg-forum-unread shadow-[0_0_8px_var(--color-forum-unread)]'
          : 'border border-forum-read'
      } ${className ?? ''}`}
    />
  )
}

export function Stamp({ at, className }: { at: TimeModel; className?: string }) {
  return (
    <time dateTime={at.iso} className={`${NUMERIC} ${className ?? ''}`}>
      {at.label}
    </time>
  )
}

export function UserRef({
  user,
  className,
  linked = true,
}: {
  user: UserRefModel
  className?: string
  linked?: boolean
}) {
  const classes = [className, user.nameClass].filter(Boolean).join(' ') || undefined

  if (!linked || user.profileHref === null) {
    return <span className={classes}>{user.username}</span>
  }
  return (
    <a href={user.profileHref} className={classes}>
      {user.username}
    </a>
  )
}
