import type {
  CountModel,
  GroupTagModel,
  PrefixModel,
  TimeModel,
  UserRefModel,
} from '@meith/theme-kit'
import { Badge, cn } from '@meith/ui'

const PAGE_WIDTH = 'max-w-6xl'

export const PAGE = `mx-auto w-full ${PAGE_WIDTH} px-4 sm:px-6`

export const PAGE_BODY = `${PAGE} flex w-full flex-col gap-5 py-5 sm:py-6`

export function pageAt(width: 'max-w-3xl' | 'max-w-4xl'): string {
  return `mx-auto w-full ${width} px-4 sm:px-6`
}

export const LINK =
  'transition-colors hover:text-primary hover:underline underline-offset-2 decoration-1 decoration-primary'

export const PRIMARY_HEADER = 'border-b-primary/15 bg-primary/6'

export const MUTED_LINK = `text-muted-foreground ${LINK}`

export const HEADER_HEIGHT = 'h-14'

export const BELOW_HEADER = 'top-14'

export const BELOW_DESKTOP_HEADER = 'lg:top-[6.5rem]'

export const PAGE_TITLE =
  'font-heading text-xl font-semibold tracking-tight text-balance sm:text-2xl'

export const SECTION_TITLE = 'font-heading text-lg font-semibold tracking-tight text-foreground'

export const EYEBROW = 'text-xs font-semibold tracking-wide text-muted-foreground uppercase'

export const PILL =
  'inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'

export function UserRef({ user, className }: { user: UserRefModel; className?: string }) {
  const classes = cn(
    'font-medium',
    user.nameClass == null && 'text-primary',
    className,
    user.nameClass,
  )
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

export function UnreadDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/15', className)}
    />
  )
}

export function ReadSpacer() {
  return <span aria-hidden="true" className="mt-1.5 size-2 shrink-0" />
}

export function Tile({
  label,
  unread,
  className,
  children,
}: {
  label: string
  unread?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const initial = (Array.from(label.trim())[0] ?? '?').toUpperCase()

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold select-none',
        unread
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-primary/10 text-primary ring-1 ring-primary/15 ring-inset',
        className,
      )}
    >
      {children ?? initial}
    </span>
  )
}

export function isEmptyRegion(node: React.ReactNode): boolean {
  if (node === null || node === undefined || node === false || node === '') return true
  return Array.isArray(node) && node.every((child) => isEmptyRegion(child))
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
  readonly value: CountModel
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
            <span className={cn('font-semibold text-foreground', NUMERIC)}>{item.value.label}</span>{' '}
            {item.value.value === 1 ? item.one : item.many}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function Figures({ items, className }: { items: readonly CountItem[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-5 text-center', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <dt className="sr-only">{item.label}</dt>
          <dd className={cn('text-sm font-semibold text-foreground', NUMERIC)}>
            {item.value.label}
          </dd>
          <dd className="text-[0.6875rem] leading-4 text-muted-foreground">
            {item.value.value === 1 ? item.one : item.many}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function groupTags(
  groups: readonly GroupTagModel[] | undefined,
  title: string | null,
): readonly GroupTagModel[] {
  if (groups !== undefined && groups.length > 0) return groups
  return title === null ? [] : [{ title }]
}
