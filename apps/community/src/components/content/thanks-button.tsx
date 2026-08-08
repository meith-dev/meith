'use client'

/**
 * "Thanks" on a post — the board's positive rating, as one press.
 *
 * F62 gave the board reputation and one way to use it: a **Rate** link to a
 * separate page carrying a form. That is the right shape for a considered
 * rating with a reason attached, and the wrong shape for the thing people
 * actually do on a community, which is say thanks for an answer that helped. A
 * page load, a form and a redirect is enough friction that most boards' totals
 * stay at zero, and `reputation.allow_negative` — off by default — describes
 * itself as making reputation "a thanks button". There was no thanks button.
 *
 * ## Why it is a form and not a fetch
 *
 * Because the board's promise is that its controls work with scripting off
 * (D06), and a rating is a write. `useActionState` is here for the pending
 * state and the error, not for the submission: with no JavaScript this is a
 * native POST that redirects back to the post it was pressed on.
 *
 * ## Why it toggles
 *
 * A plain "give +1" button does nothing visible on a second press, because
 * re-rating *updates* — the member already gave +1, so they give +1 again. A
 * control that appears not to work is worse than one that does the wrong
 * thing, because nobody reports it. Pressing it when the thanks is already
 * there takes it back, which is also the only way to undo one without going to
 * the member's profile.
 *
 * ## Why the count is here
 *
 * It is the reason to press it. A thanks nobody can see the effect of is a
 * button into a void; a number that goes up is the whole feedback loop. It is
 * the count of thanks **on this post**, not the author's board-wide total —
 * which is beside their name in the postbit already, and is a different fact.
 */

import { useActionState } from 'react'

import { cn } from '@meith/ui'

import { thankForPostAction } from '@/server/reputation-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

export function ThanksButton({
  postId,
  authorUserId,
  returnTo,
  thanked,
  count,
}: {
  postId: number
  authorUserId: number
  /** Where the redirect lands; the action appends the post's anchor. */
  returnTo: string
  /** Whether this reader has already thanked this post. */
  thanked: boolean
  /** How many people have, including this reader. */
  count: number
}) {
  const [state, action] = useActionState(thankForPostAction, EMPTY_STATE)

  return (
    <form action={action} className="inline-flex items-center">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="userId" value={authorUserId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <button
        type="submit"
        /*
         * `aria-pressed` rather than only a changed label. This is a toggle,
         * and a screen reader that is told so announces the state on focus
         * instead of only when the word underneath it happens to change.
         */
        aria-pressed={thanked}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          thanked
            ? 'bg-moderation-approved/10 text-moderation-approved hover:bg-moderation-approved/20'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {/*
          The mark is `aria-hidden` and the word is always present. A control
          announced as "thumbs up graphic" is not a control, and this board's
          rule is that nothing carries meaning in a glyph alone.
        */}
        <span aria-hidden="true">{thanked ? '★' : '☆'}</span>
        {thanked ? 'Thanked' : 'Thanks'}
        {count > 0 && (
          <span className="tabular-nums opacity-70">
            {count}
            <span className="sr-only"> {count === 1 ? 'person has' : 'people have'} thanked this</span>
          </span>
        )}
      </button>

      {/*
        The refusals this can actually hit are the daily cap and the post-count
        floor, and both are sentences worth reading. Inline and small, because
        the control is inline and small — a banner for "you have given as many
        ratings as you can today" would be louder than the thing it is about.
      */}
      {state.error !== undefined && (
        <span className="ml-2 text-xs text-destructive">{state.error}</span>
      )}
    </form>
  )
}
