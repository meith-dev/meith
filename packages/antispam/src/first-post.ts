/**
 * F46 — holding a new member's first posts for review.
 *
 * The single most effective anti-spam control a board has, and the cheapest:
 * spam accounts post once or twice and never come back, so a threshold of two
 * or three catches nearly all of it and costs a real member one wait.
 *
 * ## It is a third reason to hold a post, not a replacement for the other two
 *
 * The composer already has two — the community's own queue (`moderateNewThreads`)
 * and a warning restriction — and they compose by OR with one asymmetry F53
 * documented: `bypassesModeration` cancels the community's queue and deliberately
 * does *not* cancel a warning, because a moderator under a warning whose bypass
 * cancelled it would be the one person the restriction could not reach.
 *
 * This one follows the **community queue's** rule rather than the warning's. It is
 * a statement about trust in an account, and somebody the board has explicitly
 * granted `moderation.bypass` is an account it has already decided to trust —
 * so their first post is not held. The alternative would hold the first post of
 * every moderator the board ever appoints, which is a screen full of noise on
 * the day somebody is promoted.
 */

export interface FirstPostRule {
  /**
   * Posts an account must have before it stops being held. `0` disables it.
   *
   * Counted in *posts already made*, so a threshold of 2 holds the first two
   * and releases the third. Stated because the off-by-one is the whole
   * behaviour, and "first 2 posts" is what an operator means.
   */
  readonly threshold: number
}

export interface FirstPostSubject {
  /** `null` for a guest, who cannot reach a posting path at all. */
  readonly userId: number | null
  /** Visible posts this account already has. */
  readonly postCount: number
  /** The account holds `moderation.bypass` — an explicit grant of trust. */
  readonly bypassesModeration: boolean
}

/**
 * Whether this author's next post should be held.
 *
 * Reads `postCount` rather than an account age, and that is the choice worth
 * defending: an age threshold is satisfied by waiting, which a script does for
 * free, and it punishes the enthusiastic new member who registers and posts
 * immediately by holding everything they write for a week. A post count is
 * spent by participating, which is the thing the board actually wants to see.
 */
export function holdsForReview(
  subject: FirstPostSubject,
  rule: FirstPostRule,
): boolean {
  if (rule.threshold <= 0) return false
  if (subject.userId === null) return false
  if (subject.bypassesModeration) return false

  return subject.postCount < rule.threshold
}
