import { Badge, cn } from '@meith/ui'
import type { PrefixModel, TimeModel, UserRefModel } from '@meith/theme-kit'

const PAGE_WIDTH = 'max-w-6xl'

export const PAGE = `mx-auto w-full ${PAGE_WIDTH} px-4 sm:px-6`

export const PAGE_BODY = `${PAGE} flex w-full flex-col gap-5 py-6 sm:py-8`

export function pageAt(width: 'max-w-3xl' | 'max-w-4xl'): string {
  return `mx-auto w-full ${width} px-4 sm:px-6`
}

export const LINK = 'hover:underline underline-offset-2 decoration-1 decoration-primary'

export const MUTED_LINK = `text-muted-foreground transition-colors hover:text-foreground ${LINK}`

export function UserRef({ user, className }: { user: UserRefModel; className?: string }) {
  const classes = cn('font-medium', className, user.nameClass)
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
    <time dateTime={at.iso} className={className}>
      {at.label}
    </time>
  )
}

export function UnreadDot() {
  return <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-forum-unread" />
}

export function ReadSpacer() {
  return <span aria-hidden="true" className="mt-1.5 size-2 shrink-0" />
}

export function isEmptyRegion(node: React.ReactNode): boolean {
  if (node === null || node === undefined || node === false) return true
  return Array.isArray(node) && node.length === 0
}

export const NUMERIC = 'tabular-nums'

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

export interface CountItem {
  readonly label: string
  readonly value: number
  readonly one: string
  readonly many: string
}

export function Counts({ items, className }: { items: readonly CountItem[]; className?: string }) {
  return (
    <dl className={cn('flex gap-x-4 text-xs whitespace-nowrap text-muted-foreground', className)}>
      {items.map((item) => (
        <div key={item.label}>
          <dt className="sr-only">{item.label}</dt>
          <dd>
            <span className={cn('font-medium text-foreground', NUMERIC)}>
              {item.value.toLocaleString('en')}
            </span>{' '}
            {item.value === 1 ? item.one : item.many}
          </dd>
        </div>
      ))}
    </dl>
  )
}
