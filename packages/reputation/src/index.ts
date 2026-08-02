/**
 * `@forum/reputation` — F62.
 *
 * Members rating each other, with a comment, a per-group daily cap, board
 * settings, a history, and a total that is **derived rather than incremented**.
 *
 * Two things are worth knowing before reading the code. The uniqueness rules —
 * one rating per pair, one per post — are partial unique indexes, not prior
 * reads, because two clicks arriving together both pass a read. And the daily
 * cap is a count inside the writing transaction, because a window is not
 * something an index can express; the residual race is one extra rating, and it
 * is stated in the migration rather than hidden.
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next. "May this
 * member rate" and "how many a day" arrive as a boolean and a number, resolved
 * by `@forum/authorization` (F20).
 */
export {
  COMMENT_MAX,
  RATING_VALUES,
  parseRating,
  type RaterLimits,
  type RatingValue,
  type ReputationRepository,
  type ReputationRow,
  type ReputationSettings,
  type ReputationSummary,
} from './types'

export { ReputationService, REPUTATION_PAGE_SIZE, type GiveInput } from './service'
