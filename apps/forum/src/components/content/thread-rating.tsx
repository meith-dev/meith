import type { ThreadRating } from '@meith/polls'
import { cn } from '@meith/ui'

import { rateThreadAction } from '@/server/thread-rating-actions'
import { BOARD_MEASURE } from '@/components/shell/measure'

/**
 * F62's thread rating.
 *
 * ## What was wrong with it
 *
 * It rendered `Rating: 4.3 / 5 (4)` in a bare `<p>`, followed by five
 * unstyled `<button>`s reading `1★ 2★ 3★ 4★ 5★`. Tailwind's preflight strips a
 * button back to plain text, so the control did not look like a control — it
 * looked like a line of debug output above the thread title. It also sat in
 * `px-6`, which is full-bleed, while every other region on the page is centred
 * in `BOARD_MEASURE`, so the one line on the page that was not aligned with
 * anything was this one.
 *
 * And it dropped `rating.mine`, which the repository goes out of its way to
 * fetch: a member who had already rated the thread was shown five identical
 * buttons with no indication of which one they had pressed, so the only way to
 * find out was to press one and see what the average did.
 *
 * ## What it is now
 *
 * Stars, because a five-point scale drawn as five shapes is read at a glance
 * and `4.3 / 5` is read as arithmetic. The average is a row of five, filled
 * proportionally — a `4.3` shows four full and one 30% full, which is the
 * difference between "about four" and "exactly four" without printing a
 * decimal twice.
 *
 * **Colour is never the only carrier.** The figure is written out beside the
 * stars ("4.3 out of 5, from 4 ratings"), every button has a real accessible
 * name, and the member's own rating is marked with a word as well as a fill.
 *
 * ## Still five submit buttons in a native form
 *
 * The value travels on the button, so there is nothing to get out of step with
 * it, and with scripting off the pressed button is still the one whose
 * name/value is submitted. This is not a client component and must not become
 * one: rating a thread is a POST that reloads a page, which is the cheapest
 * correct implementation of exactly this feature.
 */

const STAR_PATH = 'M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.21l-4.94 2.6.94-5.5-4-3.9 5.53-.8z'

/**
 * A single star. `fill` is 0–1; anything strictly between draws a partial.
 *
 * `gradientId` is required for a partial and unused otherwise, which is the
 * whole reason the full and empty cases take the cheap path: a `<linearGradient>`
 * needs a document-unique id, this is a Server Component so there is no `useId`,
 * and five stars sharing one id would be invalid markup on every thread page.
 * At most one star in a row is ever partial, so at most one id is ever needed.
 */
function Star({
  fill,
  gradientId,
  className,
}: {
  fill: number
  gradientId?: string
  className?: string
}) {
  const clamped = Math.max(0, Math.min(1, fill))
  const partial = clamped > 0 && clamped < 1 && gradientId !== undefined

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn('size-4', className)}>
      {/*
       * A gradient rather than a clip path: a clip would cut the outline too, so
       * a half-filled star would lose half its border and read as a different
       * shape. Filling through a gradient keeps one outline and varies only what
       * is inside it.
       */}
      {partial && (
        <defs>
          <linearGradient id={gradientId}>
            <stop offset={`${clamped * 100}%`} stopColor="currentColor" />
            <stop offset={`${clamped * 100}%`} stopColor="transparent" />
          </linearGradient>
        </defs>
      )}
      <path
        d={STAR_PATH}
        fill={partial ? `url(#${gradientId})` : clamped >= 1 ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The average, as five proportionally filled stars. */
function Average({ value, threadId }: { value: number; threadId: number }) {
  return (
    <span className="flex items-center gap-0.5 text-thread-pinned">
      {[0, 1, 2, 3, 4].map((index) => (
        <Star key={index} fill={value - index} gradientId={`thread-${threadId}-star-${index}`} />
      ))}
    </span>
  )
}

export function ThreadRatingForm({
  threadId,
  rating,
  canRate,
}: {
  threadId: number
  rating: ThreadRating
  canRate: boolean
}) {
  /* Nothing to show and nothing to do: render nothing rather than an empty box. */
  if (rating.count === 0 && !canRate) return null

  return (
    <div className={BOARD_MEASURE}>
      <section
        aria-label="Thread rating"
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-4 py-3"
      >
        <div className="flex items-center gap-2.5">
          {rating.count === 0 ? (
            <p className="text-sm text-muted-foreground">No ratings yet.</p>
          ) : (
            <>
              <Average value={rating.average} threadId={threadId} />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {rating.average.toFixed(1)}
                </span>{' '}
                out of 5
                <span className="sr-only">
                  , from {rating.count} {rating.count === 1 ? 'rating' : 'ratings'}
                </span>
                <span aria-hidden="true" className="tabular-nums">
                  {' · '}
                  {rating.count} {rating.count === 1 ? 'rating' : 'ratings'}
                </span>
              </p>
            </>
          )}
        </div>

        {canRate && (
          <form action={rateThreadAction} className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="threadId" value={threadId} />

            <span id={`rate-${threadId}`} className="text-muted-foreground">
              {rating.mine === null ? 'Rate it' : 'Your rating'}
            </span>

            <span
              role="group"
              aria-labelledby={`rate-${threadId}`}
              className="flex items-center gap-0.5"
            >
              {[1, 2, 3, 4, 5].map((value) => {
                const chosen = rating.mine !== null && value <= rating.mine

                return (
                  <button
                    key={value}
                    type="submit"
                    name="rating"
                    value={value}
                    /*
                     * The full sentence, because "3" on its own is what a screen
                     * reader would otherwise announce for a control that changes
                     * a public number. `aria-pressed` is deliberately absent:
                     * these are submits, not toggles, and the state they carry
                     * is reported in the name instead.
                     */
                    aria-label={
                      rating.mine === value
                        ? `${value} out of 5 — your current rating`
                        : `Rate ${value} out of 5`
                    }
                    className={cn(
                      'inline-flex size-7 items-center justify-center rounded-md transition-colors',
                      'hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      chosen ? 'text-thread-pinned' : 'text-muted-foreground',
                    )}
                  >
                    <Star fill={chosen ? 1 : 0} className="size-5" />
                  </button>
                )
              })}
            </span>

            {rating.mine !== null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                You rated this {rating.mine}
              </span>
            )}
          </form>
        )}
      </section>
    </div>
  )
}
