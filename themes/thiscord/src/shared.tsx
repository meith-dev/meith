import { Avatar, cn } from '@meith/ui'
import type { PrefixModel, TimeModel, UserRefModel } from '@meith/theme-kit'

export const PAGE = 'mx-auto w-full max-w-6xl px-3 sm:px-4'

export const COLUMN = 'mx-auto w-full max-w-5xl'

export const PANEL =
  'rounded-lg border border-border bg-card text-card-foreground shadow-elevation'

const BUTTON =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-sm ' +
  'text-sm font-medium whitespace-nowrap transition-colors duration-200'

export const BTN = `${BUTTON} h-9 px-4 bg-secondary text-secondary-foreground hover:bg-accent`

export const BTN_PRIMARY = `${BUTTON} h-9 px-4 bg-primary text-primary-foreground hover:bg-primary-hover`

export const BTN_QUIET = `${BUTTON} h-9 px-4 text-muted-foreground hover:bg-accent hover:text-foreground`

export const LINK = 'text-primary hover:underline underline-offset-2'

export const NAME_LINK = 'font-medium text-foreground hover:underline underline-offset-2'

export const MUTED_LINK =
  'text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-2'

export const NUMERIC = 'tabular-nums'

export const CATEGORY_HEADING =
  'text-xs font-bold tracking-wide text-muted-foreground uppercase'

export function UserRef({ user, className }: { user: UserRefModel; className?: string }) {
  if (user.profileHref === null) {
    return <span className={cn('font-medium', className, user.nameClass)}>{user.username}</span>
  }
  return (
    <a href={user.profileHref} className={cn(NAME_LINK, className, user.nameClass)}>
      {user.username}
    </a>
  )
}

export function Stamp({ at, className }: { at: TimeModel; className?: string }) {
  return (
    <time dateTime={at.iso} className={className}>
      {at.label}
    </time>
  )
}

export function Circle({
  src = null,
  name,
  size = 40,
  className,
}: {
  src?: string | null
  name: string
  size?: number
  className?: string
}) {
  return (
    <Avatar
      src={src}
      name={name}
      size={size}
      className={cn('rounded-full border-transparent bg-surface', className)}
    />
  )
}

export function Squircle({
  name,
  size = 48,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  return (
    <Avatar
      src={null}
      name={name}
      size={size}
      className={cn(
        'rounded-2xl border-transparent bg-secondary text-foreground transition-[border-radius] duration-300 group-hover:rounded-full',
        className,
      )}
    />
  )
}

export function OnlineDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute right-0 bottom-0 size-3 rounded-full bg-moderation-approved ring-2 ring-card',
        className,
      )}
    />
  )
}

export function Hash({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('shrink-0 text-lg leading-none font-medium text-muted-foreground', className)}
    >
      #
    </span>
  )
}

export function UnreadPill({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-1/2 -left-1 h-5 w-1 -translate-y-1/2 rounded-r-full bg-forum-unread',
        className,
      )}
    />
  )
}

const PREFIX_TONES: Record<string, string> = {
  'thread-pinned': 'bg-thread-pinned/12 text-thread-pinned',
  'thread-locked': 'bg-thread-locked/12 text-thread-locked',
  'thread-moved': 'bg-thread-moved/12 text-thread-moved',
  'thread-unapproved': 'bg-thread-unapproved/12 text-thread-unapproved',
  'thread-deleted': 'bg-thread-deleted/12 text-thread-deleted',
  'moderation-pending': 'bg-moderation-pending/12 text-moderation-pending',
  'moderation-approved': 'bg-moderation-approved/12 text-moderation-approved',
  'moderation-rejected': 'bg-moderation-rejected/12 text-moderation-rejected',
  'group-admin': 'bg-group-admin/12 text-group-admin',
  'group-supermod': 'bg-group-supermod/12 text-group-supermod',
  'group-mod': 'bg-group-mod/12 text-group-mod',
  'group-banned': 'bg-group-banned/12 text-group-banned',
}

const NEUTRAL_TONE = 'bg-secondary text-muted-foreground'

export function Tag({
  children,
  token = null,
  className,
}: {
  children: React.ReactNode
  token?: string | null
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold',
        token === null ? NEUTRAL_TONE : (PREFIX_TONES[token] ?? NEUTRAL_TONE),
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Prefix({ prefix }: { prefix: PrefixModel }) {
  return <Tag token={prefix.token}>{prefix.label}</Tag>
}

export function Rail({
  title,
  titleId,
  action,
  children,
  className,
}: {
  title: string
  titleId: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={titleId} className={cn(PANEL, className)}>
      <div className="flex items-center justify-between gap-3 px-3 pt-3 pb-1">
        <h2 id={titleId} className={CATEGORY_HEADING}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function isEmptyRegion(node: React.ReactNode): boolean {
  if (node === null || node === undefined || node === false) return true
  return Array.isArray(node) && node.length === 0
}

export function count(value: number): string {
  return value.toLocaleString('en')
}

export function plural(value: number, one: string, many: string): string {
  return value === 1 ? one : many
}
