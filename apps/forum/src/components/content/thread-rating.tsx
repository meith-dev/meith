import type { ThreadRating } from '@meith/polls'
import { cn } from '@meith/ui'

import { rateThreadAction } from '@/server/thread-rating-actions'

const STAR_PATH = 'M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.21l-4.94 2.6.94-5.5-4-3.9 5.53-.8z'

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
      { }
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
  if (rating.count === 0 && !canRate) return null

  return (
    <section aria-label="Thread rating" className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
  )
}
