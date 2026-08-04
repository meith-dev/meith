import type { ThreadRating } from '@meith/polls'
import { rateThreadAction } from '@/server/thread-rating-actions'

export function ThreadRatingForm({
  threadId,
  rating,
  canRate,
}: {
  threadId: number
  rating: ThreadRating
  canRate: boolean
}) {
  return (
    <section className="px-6 pt-4" aria-label="Thread rating">
      <p className="text-sm">
        Rating:{' '}
        {rating.count === 0
          ? 'none yet'
          : `${rating.average.toFixed(1)} / 5 (${rating.count})`}
      </p>
      {canRate && (
        <form action={rateThreadAction} className="mt-2 flex gap-1">
          <input type="hidden" name="threadId" value={threadId} />
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="submit"
              name="rating"
              value={value}
              aria-label={`${value} stars`}
            >
              {value}★
            </button>
          ))}
        </form>
      )}
    </section>
  )
}
