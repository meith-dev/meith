import type {
  CountModel,
  GroupTagModel,
  PrefixModel,
  TimeModel,
  UserRefModel,
} from '@meith/theme-kit'
import { cn } from '@meith/ui'

export const SHELL = 'mx-auto w-[min(72rem,100%-2.5rem)]'

export const PAGE_BODY = `${SHELL} flex flex-col gap-10 py-8 sm:gap-12 sm:py-12`

export const LABEL = 'font-mono text-[0.6875rem] uppercase tracking-[0.075em] text-muted-foreground'

const PAGE_TITLE_SIZE = 'text-[clamp(1.75rem,1.4rem+1.4vw,2.6rem)]'

export const PAGE_TITLE = `font-heading ${PAGE_TITLE_SIZE} font-normal leading-[1.2] tracking-[-0.025em] text-balance text-foreground [overflow-wrap:anywhere]`

const SECTION_TITLE_SIZE = 'text-[clamp(1.5rem,1.2rem+1vw,2.1rem)]'

export const SECTION_TITLE = `font-heading ${SECTION_TITLE_SIZE} font-normal leading-[1.25] tracking-[-0.025em] text-foreground`

export const ITEM_TITLE =
  'text-[0.95rem] font-medium leading-normal text-foreground sm:text-[1.02rem]'

export const META = 'text-[0.8125rem] leading-relaxed text-muted-foreground'

export const SMALL_PRINT = 'text-xs leading-relaxed text-muted-foreground'

export const LEDE = 'max-w-[32rem] text-[0.95rem] leading-[1.75] text-muted-foreground text-pretty'

export const BODY_MEASURE = 'max-w-[42rem]'

export const NUMERIC = 'font-mono tabular-nums'

export const TEXT_LINK =
  'underline decoration-primary/55 decoration-1 underline-offset-[0.3em] transition-colors hover:text-primary hover:decoration-primary'

export const QUIET_LINK = 'transition-colors hover:text-primary'

const SERIF_FACE = 'font-[Iowan_Old_Style,Palatino_Linotype,Book_Antiqua,Georgia,serif]'

export const SERIF = `${SERIF_FACE} font-normal italic text-primary`

export const EDITORIAL_RULE = 'border-t-2 border-foreground'

export const ITEM_RULE = 'border-t border-foreground/15'

export const RULE = 'border-t border-border'

export const ROW_HOVER = 'transition-colors hover:border-primary hover:bg-accent'

export const PRIMARY_ACTION =
  'group inline-flex min-h-[3.2rem] items-center justify-between gap-8 bg-primary px-5 text-[0.85rem] font-medium whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary-hover'

export const TOUCH = 'pointer-coarse:min-h-11'

export const ARROW =
  'ms-1 inline-block text-muted-foreground transition-[color,transform] group-hover:text-primary motion-safe:group-hover:-translate-y-px motion-safe:group-hover:translate-x-px'

export function Arrow({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn(ARROW, className)}>
      ↗
    </span>
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
      <Arrow className="ms-0 text-[1.2em] leading-none text-current" />
    </a>
  )
}

export function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <g className="fill-primary">
        <rect x="2" y="3" width="28" height="20" rx="6" />
        <path d="M10 19 L8.4 28.6 L16.6 22.2 Z" />
      </g>
      <g className="fill-primary-foreground">
        <rect x="8" y="9" width="16" height="2.8" rx="1.4" />
        <rect x="8" y="14.4" width="10" height="2.8" rx="1.4" />
      </g>
    </svg>
  )
}

export function Wordmark({ title, className }: { title: string; className?: string }) {
  const words = title.trim().split(/\s+/)
  if (words.length < 2) return <span className={className}>{title}</span>

  const last = words.pop()
  return (
    <span className={className}>
      <span aria-hidden="true">
        {words.join(' ')} <em className={SERIF}>{last}</em>
      </span>
      <span className="sr-only">{title}</span>
    </span>
  )
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
      className={cn('inline-block size-1.5 shrink-0 bg-primary', className)}
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
  return <span className={cn(LABEL, colour, className)}>{children}</span>
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
