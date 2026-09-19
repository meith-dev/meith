import type {
  CountModel,
  GroupTagModel,
  PrefixModel,
  TimeModel,
  UserRefModel,
} from '@meith/theme-kit'
import { cn } from '@meith/ui'

export const SHELL = 'mx-auto w-[min(75rem,100%-3rem)]'

export const PAGE_BODY = `${SHELL} flex flex-col gap-8 py-8 sm:gap-10 sm:py-12`

export const LABEL =
  'font-mono text-[0.6875rem] font-medium uppercase tracking-[0.09em] text-muted-foreground'

const PAGE_TITLE_SIZE = 'text-[clamp(1.875rem,1.2rem+2.6vw,3rem)]'

export const PAGE_TITLE = `font-heading ${PAGE_TITLE_SIZE} font-semibold leading-[1.05] tracking-[-0.045em] text-balance text-foreground [overflow-wrap:anywhere]`

const SECTION_TITLE_SIZE = 'text-[clamp(1.375rem,1rem+1.6vw,2rem)]'

export const SECTION_TITLE = `font-heading ${SECTION_TITLE_SIZE} font-semibold leading-[1.15] tracking-[-0.035em] text-foreground`

export const ITEM_TITLE =
  'text-[0.9375rem] font-medium leading-normal tracking-[-0.006em] text-foreground sm:text-[1rem]'

export const META = 'text-[0.8125rem] leading-relaxed text-muted-foreground'

export const SMALL_PRINT = 'text-xs leading-relaxed text-muted-foreground'

export const LEDE = 'max-w-[38rem] text-[0.9375rem] leading-[1.6] text-muted-foreground text-pretty'

export const BODY_MEASURE = 'max-w-[46rem]'

export const NUMERIC = 'font-mono tabular-nums'

export const TEXT_LINK =
  'font-medium text-primary underline-offset-[0.2em] transition-colors hover:underline'

export const QUIET_LINK = 'transition-colors hover:text-primary'

export const CARD = 'rounded-[0.75rem] bg-card ring-1 ring-border shadow-[var(--shadow-elevation)]'

export const RULE = 'border-t border-border'

export const ITEM_RULE = 'border-t border-border'

export const ROW_HOVER = 'transition-colors hover:bg-accent'

export const TOUCH = 'pointer-coarse:min-h-11'

export const PRIMARY_ACTION =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-[0.8125rem] font-medium whitespace-nowrap text-background transition-colors hover:bg-foreground/85 pointer-coarse:h-11'

export const GHOST_ACTION = `inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-3 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${TOUCH}`

export const ARROW = 'text-current transition-transform'

export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('ms-1 inline-block size-3.5 shrink-0', className)}
    >
      <path d="M4.5 11.5 11.5 4.5" />
      <path d="M6 4.5h5.5V10" />
    </svg>
  )
}

export function Action({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <a href={href} className={cn(PRIMARY_ACTION, className)}>
      {children}
    </a>
  )
}

export function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('fill-foreground', className)}>
      <path d="M12 3 22 20H2Z" />
    </svg>
  )
}

export function Wordmark({ title, className }: { title: string; className?: string }) {
  return <span className={className}>{title}</span>
}

export function Label({
  as: Component = 'p',
  className,
  ...props
}: React.ComponentProps<'p'> & { as?: 'p' | 'h2' | 'h3' | 'span' | 'dt' | 'div' }) {
  return <Component className={cn(LABEL, className)} {...props} />
}

export function UserRef({ user, className }: { user: UserRefModel; className?: string }) {
  const classes = cn(
    'font-medium',
    user.nameClass == null && 'text-foreground',
    className,
    user.nameClass,
  )
  if (user.profileHref === null) {
    return <span className={classes}>{user.username}</span>
  }
  return (
    <a href={user.profileHref} className={cn(QUIET_LINK, classes)}>
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

export function UnreadMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-1.5 shrink-0 rounded-full bg-primary', className)}
    />
  )
}

const MARK_TONES = {
  'thread-pinned': 'text-thread-pinned',
  'thread-locked': 'text-thread-locked',
  'thread-moved': 'text-thread-moved',
  'thread-unapproved': 'text-thread-unapproved',
  'thread-deleted': 'text-thread-deleted',
  'moderation-pending': 'text-moderation-pending',
  'moderation-approved': 'text-moderation-approved',
  'moderation-rejected': 'text-moderation-rejected',
  'group-admin': 'text-group-admin',
  'group-supermod': 'text-group-supermod',
  'group-mod': 'text-group-mod',
  'group-banned': 'text-group-banned',
} as const

export type MarkTone = keyof typeof MARK_TONES

export function Mark({
  tone = null,
  className,
  children,
}: {
  tone?: MarkTone | string | null
  className?: string | undefined
  children: React.ReactNode
}) {
  const colour = tone === null ? undefined : MARK_TONES[tone as MarkTone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.06em]',
        colour ?? 'text-muted-foreground',
        className,
      )}
    >
      {tone !== null && (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      )}
      {children}
    </span>
  )
}

export function Prefix({ prefix }: { prefix: PrefixModel }) {
  return <Mark tone={prefix.token}>{prefix.label}</Mark>
}

export interface CountItem {
  readonly label: string
  readonly value: CountModel
  readonly one: string
  readonly many: string
}

export function Counts({ items, className }: { items: readonly CountItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        'flex flex-wrap gap-x-4 gap-y-0.5 text-[0.8125rem] text-muted-foreground',
        NUMERIC,
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="sr-only">{item.label}</dt>
          <dd>
            <span className="text-foreground">{item.value.label}</span>{' '}
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

export function isEmptyRegion(node: React.ReactNode): boolean {
  if (node === null || node === undefined || node === false || node === '') return true
  return Array.isArray(node) && node.every((child) => isEmptyRegion(child))
}
