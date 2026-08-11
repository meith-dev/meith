import { Avatar, cn } from '@meith/ui'
import type { PrefixModel, TimeModel, UserRefModel } from '@meith/theme-kit'

export const PAGE = 'mx-auto w-full max-w-6xl px-3 sm:px-4'

export const FEED = 'mx-auto w-full max-w-[42rem]'

export const PAGE_BODY = `${PAGE} flex w-full flex-col gap-4 py-4 sm:py-6`

const PILL_BASE =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-full ' +
  'text-sm font-semibold whitespace-nowrap transition-colors duration-100'

export const PILL = `${PILL_BASE} h-9 px-4 bg-secondary text-secondary-foreground hover:bg-accent`

export const PILL_PRIMARY = `${PILL_BASE} h-9 px-4 bg-primary text-primary-foreground hover:bg-primary-hover`

export const PILL_QUIET = `${PILL_BASE} h-9 px-4 text-muted-foreground hover:bg-accent hover:text-foreground`

export const ICON_BUTTON =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary ' +
  'text-foreground transition-colors duration-100 hover:bg-accent'

export const LINK = 'text-primary hover:underline underline-offset-2'

export const NAME_LINK = 'font-semibold text-foreground hover:underline underline-offset-2'

export const MUTED_LINK =
  'text-muted-foreground transition-colors hover:underline underline-offset-2'

export const NUMERIC = 'tabular-nums'

export function UserRef({ user, className }: { user: UserRefModel; className?: string }) {
  if (user.profileHref === null) {
    return <span className={cn('font-semibold', className, user.nameClass)}>{user.username}</span>
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

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground',
        NUMERIC,
        className,
      )}
    >
      {children}
    </span>
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
        'inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold',
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
    <section
      aria-labelledby={titleId}
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-elevation',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-3 pb-1">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-muted-foreground">
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
