/**
 * The pieces every slot in this theme repeats.
 *
 * Not a second component library — `@meith/ui` is that, and anything here that
 * two *themes* would want belongs there instead. What lives in this file is the
 * handful of decisions that are **this theme's**, made once so that twenty-four
 * slots cannot each make them slightly differently: how wide a page is, what a
 * link looks like, how a username renders when the account behind it is gone.
 *
 * The three that matter, and why they are decisions rather than helpers:
 *
 * **`UserRef`.** `profileHref` is `null` for a deleted account, and every place
 * a name appears has to render the name anyway. Written out at each call site
 * that is a ternary somebody eventually forgets, and the symptom is a listing
 * that blanks a row — or crashes — because an account was deleted. It is the
 * single commonest bug in forum software.
 *
 * **`Stamp`.** Every timestamp needs both halves of `TimeModel`: the machine
 * value in `datetime`, the preformatted label as text. A `<time>` without the
 * attribute is a string nothing can read; a label built in the theme is a
 * hydration mismatch for every reader outside the server's timezone.
 *
 * **`prefixTone`.** A thread prefix carries an operator-chosen token *name* out
 * of the database — `"thread-pinned"`, or anything else somebody typed. Tailwind
 * generates classes at build time from source text, so `text-${token}` produces
 * nothing at all: the styles would silently not exist. So the mapping is a
 * literal table of the names this theme knows how to paint, and everything else
 * renders in the neutral tone rather than unstyled.
 */

import { Badge, cn } from '@meith/ui'
import type { PrefixModel, TimeModel, UserRefModel } from '@meith/theme-kit'

/**
 * The page's measure.
 *
 * `max-w-6xl` rather than the `5xl` this theme used to be. A forum listing is
 * four columns wide — marker, title, counters, last post — and at 1024px the
 * last two were being squeezed until the last-post author wrapped under its own
 * timestamp. Prose is kept narrow where prose actually is (`.prose-bb` caps a
 * post body at 72ch); a table of rows is not prose and does not want a
 * paragraph's measure.
 */
export const PAGE = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

/** A page body: the measure, plus the vertical rhythm every route shares. */
export const PAGE_BODY = `${PAGE} flex w-full flex-col gap-5 py-6 sm:py-8`

/**
 * A link in running text or a listing.
 *
 * Underlined on hover rather than always, and never coloured. This theme's
 * `primary` is ink, so a coloured link would be indistinguishable from body
 * text — and colouring links in a board whose operator has just set their brand
 * to a pale yellow is how a board becomes unreadable in one settings save. The
 * affordance is the hover underline plus the pointer, which is what every
 * listing-heavy site settled on for the same reason.
 */
export const LINK = 'hover:underline underline-offset-2 decoration-1'

/** A quiet link: navigation, metadata, anything that is not the row's subject. */
export const MUTED_LINK = `text-muted-foreground transition-colors hover:text-foreground ${LINK}`

/**
 * A username, linked when there is somewhere to link to.
 *
 * See this file's header. `profileHref` is `null` for a deleted account and the
 * name is still shown, because a thread whose author was deleted is still a
 * thread somebody wrote.
 */
export function UserRef({ user, className }: { user: UserRefModel; className?: string }) {
  if (user.profileHref === null) {
    return <span className={cn('font-medium', className)}>{user.username}</span>
  }
  return (
    <a href={user.profileHref} className={cn('font-medium', LINK, className)}>
      {user.username}
    </a>
  )
}

/** A timestamp, with the machine value where a machine can find it. */
export function Stamp({ at, className }: { at: TimeModel; className?: string }) {
  return (
    <time dateTime={at.iso} className={className}>
      {at.label}
    </time>
  )
}

/**
 * The dot beside an unread row.
 *
 * `aria-hidden`, always, and always beside a `sr-only` sentence supplied by the
 * caller. "This forum has new posts" is information, and information carried
 * only by a coloured circle is absent for a large number of readers and for
 * every screen reader.
 */
export function UnreadDot() {
  return <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-forum-unread" />
}

/** Keeps the dot's space when a row is read, so titles stay in one column. */
export function ReadSpacer() {
  return <span aria-hidden="true" className="mt-1.5 size-2 shrink-0" />
}

/**
 * Did a region render nothing?
 *
 * A region arrives as a `ReactNode`, and a node that will render nothing is
 * indistinguishable from one that will render something — until it does.
 * `:empty` in CSS can *hide* a box that turned out to have no children, and
 * that is what the postbit's footer uses; it cannot put a sentence in one.
 *
 * A forum with no threads needs the sentence. The page hands the listing an
 * array of rendered rows, so an empty array is the honest signal available
 * here, and the model's own note says the empty state is the theme's to
 * supply.
 */
export function isEmptyRegion(node: React.ReactNode): boolean {
  if (node === null || node === undefined || node === false) return true
  return Array.isArray(node) && node.length === 0
}

/**
 * Numbers in a listing, in a face whose digits are all one width.
 *
 * Without this a column of counts jitters left and right as the digits change,
 * and a reader scanning for the busiest forum is comparing ragged edges.
 */
export const NUMERIC = 'tabular-nums'

/**
 * Token name → badge tone, for a thread prefix.
 *
 * See this file's header for why this is a table and not interpolation. The
 * names are the domain-semantic tokens from `globals.css`; a prefix pointing at
 * anything else — including a token this theme paints but has no tone for, like
 * `forum-read` — gets `neutral`, which is a legible badge rather than a missing
 * one.
 */
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

/** A thread prefix, rendered in whatever tone its operator chose for it. */
export function Prefix({ prefix }: { prefix: PrefixModel }) {
  return <Badge tone={prefixTone(prefix.token)}>{prefix.label}</Badge>
}

/**
 * A row of counters — "412 threads · 9,130 posts".
 *
 * A `<dl>` because that is what it is: each number has a name, and the names are
 * `sr-only` because sighted readers get them from the unit beside the figure.
 * Grouped thousands, because 9130 and 91300 are the same shape at a glance.
 *
 * Both forms of the noun are given rather than a singular with an `+ 's'` rule.
 * The board counts replies, and "1 replys" is the kind of thing that survives a
 * review and then sits on the busiest page of a forum forever. Four words need
 * two spellings each; a real pluralisation rule needs a translation layer, and
 * that is not a thing to improvise in a theme one irregular noun at a time.
 */
export interface CountItem {
  /** The accessible name for the figure. */
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
