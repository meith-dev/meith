import { Badge, cn } from '@meith/ui'
import type { PrefixModel, TimeModel, UserRefModel } from '@meith/theme-kit'

export const PAGE = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

export const PAGE_BODY = `${PAGE} flex w-full flex-col gap-4 py-5 sm:py-6`

export function pageAt(width: 'max-w-3xl' | 'max-w-4xl'): string {
  return `mx-auto w-full ${width} px-4 sm:px-6`
}

export const HEADING = 'font-heading font-bold uppercase tracking-[0.03em]'

export const MICRO_BARE = 'text-[0.6875rem] font-bold uppercase tracking-[0.11em]'

export const MICRO = `${MICRO_BARE} text-muted-foreground`

export const NUMERIC = 'tabular-nums'

export const LINK = 'hover:underline underline-offset-2 decoration-2'

export const MUTED_LINK = `text-muted-foreground transition-colors hover:text-foreground ${LINK}`

export const CHIP =
  'inline-flex items-center rounded-sm border-s-2 border-s-secondary bg-surface px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground transition-colors hover:border-s-primary hover:text-foreground'

export const TAB =
  'inline-flex h-11 items-center px-3.5 text-sm font-bold tracking-[0.03em] whitespace-nowrap uppercase transition-colors'

export const BUTTON =
  'inline-flex h-8 items-center rounded-sm px-3 text-[0.6875rem] font-bold tracking-[0.08em] whitespace-nowrap uppercase transition-colors'

/** The columns every listing shares: name, two counts, and what happened last. */
export const TABLE_ROW =
  'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 py-2.5 md:grid-cols-[auto_minmax(0,1fr)_4.5rem_4.5rem_14rem] md:items-center'

/** The club's two colours, stacked — the stripe every panel is hung on. */
export function ClubBar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex w-1 shrink-0 flex-col overflow-hidden', className)}
    >
      <span className="flex-[3] bg-primary" />
      <span className="flex-[2] bg-secondary" />
    </span>
  )
}

/** The same pair laid flat, under the masthead and over the footer. */
export function ClubRule({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex h-1 w-full', className)}>
      <span className="flex-1 bg-primary" />
      <span className="w-24 bg-secondary" />
    </span>
  )
}

export function ColumnHeads({
  first,
  counts,
  last,
}: {
  first: string
  counts: readonly [string, string]
  last: string
}) {
  return (
    <div
      aria-hidden="true"
      className={`hidden border-b-2 border-b-secondary bg-surface md:grid ${TABLE_ROW} py-1.5`}
    >
      <span />
      <span className={MICRO}>{first}</span>
      <span className={`${MICRO} text-right`}>{counts[0]}</span>
      <span className={`${MICRO} text-right`}>{counts[1]}</span>
      <span className={MICRO}>{last}</span>
    </div>
  )
}

export function Tally({ value, label }: { value: number; label: string }) {
  return (
    <span className={`${NUMERIC} text-sm font-semibold text-foreground md:text-right`}>
      {value.toLocaleString('en')}
      <span className={`${MICRO} ms-1 md:hidden`}>{label}</span>
    </span>
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
  aside?: React.ReactNode
}) {
  return (
    <div className="flex items-stretch border-b border-border bg-card">
      <ClubBar />

      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3.5 py-2.5">
        <h2 id={id} className={`${HEADING} text-sm text-foreground`}>
          {href == null ? (
            title
          ) : (
            <a href={href} className={LINK}>
              {title}
            </a>
          )}
        </h2>
        {aside}
      </div>
    </div>
  )
}

export function PageHead({
  children,
  actions,
}: {
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-stretch gap-3">
      <ClubBar className="rounded-sm" />
      <div className="min-w-0 flex-1 self-center">{children}</div>
      {actions !== undefined && (
        <div className="flex shrink-0 items-center gap-2 self-center">{actions}</div>
      )}
    </div>
  )
}

export function Crest({ title }: { title: string }) {
  const initials = title
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => [...word][0]?.toLocaleUpperCase('en') ?? '')
    .join('')

  return (
    <span
      aria-hidden="true"
      className={`grid size-9 shrink-0 place-items-center rounded-sm bg-primary text-sm leading-none text-primary-foreground ring-1 ring-secondary ${HEADING}`}
    >
      {initials}
    </span>
  )
}

export function UserRef({ user, className }: { user: UserRefModel; className?: string }) {
  const classes = cn('font-semibold', className, user.nameClass)
  if (user.profileHref === null) {
    return <span className={classes}>{user.username}</span>
  }
  return (
    <a href={user.profileHref} className={cn(LINK, classes)}>
      {user.username}
    </a>
  )
}

export function Stamp({ at, className }: { at: TimeModel; className?: string }) {
  return (
    <time dateTime={at.iso} className={cn(NUMERIC, className)}>
      {at.label}
    </time>
  )
}

export function ReadMark({ unread }: { unread: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 inline-block h-4 w-1 shrink-0 rounded-sm',
        unread ? 'bg-primary' : 'bg-border',
      )}
    />
  )
}

export function isEmptyRegion(node: React.ReactNode): boolean {
  if (node === null || node === undefined || node === false) return true
  return Array.isArray(node) && node.length === 0
}

const PREFIX_TONES = {
  'thread-pinned': 'pinned',
  'thread-locked': 'locked',
  'thread-moved': 'moved',
  'thread-unapproved': 'unapproved',
  'thread-deleted': 'deleted',
  'moderation-pending': 'pending',
  'moderation-approved': 'approved',
  'moderation-rejected': 'rejected',
  'group-admin': 'admin',
  'group-supermod': 'supermod',
  'group-mod': 'mod',
  'group-banned': 'banned',
} as const

type PrefixTone = (typeof PREFIX_TONES)[keyof typeof PREFIX_TONES]

export function prefixTone(token: string | null): PrefixTone | 'neutral' {
  if (token === null) return 'neutral'
  return PREFIX_TONES[token as keyof typeof PREFIX_TONES] ?? 'neutral'
}

export function Prefix({ prefix }: { prefix: PrefixModel }) {
  return <Badge tone={prefixTone(prefix.token)}>{prefix.label}</Badge>
}
