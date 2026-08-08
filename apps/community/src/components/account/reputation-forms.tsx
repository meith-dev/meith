"use client"

/**
 * F62's rating form and withdraw button.
 *
 * Client components only for `useActionState`; both submit natively with
 * scripting off. The three rating values are three submit buttons rather than a
 * `<select>` and a separate submit: it is one fewer control, and the button
 * that was pressed is what carries the value.
 */
import { useActionState } from "react"

import { rateMemberAction, withdrawRatingAction } from "@/server/reputation-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

const FIELD =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const CARD = "flex flex-col gap-3 rounded-lg border border-border bg-card p-5"

const CHOICE =
  "inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

export function RateMemberForm({
  userId,
  username,
  postId = null,
  returnTo,
  allowNegative,
  commentRequired,
  existingComment = null,
  existingPoints = null,
  remainingLabel = null,
}: {
  userId: number
  username: string
  /** Set when rating one post rather than the member's profile. */
  postId?: number | null
  returnTo: string
  allowNegative: boolean
  commentRequired: boolean
  /** What this rater said last time, so revising starts from it. */
  existingComment?: string | null
  existingPoints?: number | null
  remainingLabel?: string | null
}) {
  const [state, action] = useActionState(rateMemberAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      {postId === null ? null : <input type="hidden" name="postId" value={postId} />}
      <input type="hidden" name="returnTo" value={returnTo} />

      <h2 className="text-lg font-semibold tracking-tight">
        {existingPoints === null ? `Rate ${username}` : `Change your rating of ${username}`}
      </h2>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Why{commentRequired ? "" : " (optional)"}
        </span>
        <textarea
          name="comment"
          defaultValue={state.values?.["comment"] ?? existingComment ?? ""}
          className={FIELD}
          rows={3}
          maxLength={500}
          required={commentRequired}
        />
        <span className="text-xs text-muted-foreground">
          Plain text, shown on their profile beside your name.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          The value travels on the button, so there is no separate control to
          get out of step with it — and with scripting off the pressed button is
          still the one whose name/value is submitted.

          **The labels follow the board's own setting.** With negatives off,
          `reputation.allow_negative` describes what is left as "a thanks
          button" — and "Positive / Neutral" is not one. A board that has
          decided members may only say something kind should be asking "do you
          want to thank this person", not offering two thirds of a scale whose
          missing third is what made the words mean anything. Neutral stays,
          because a comment with no verdict is a real thing to want and is what
          most ratings turn out to be; it is just no longer the opposite of
          anything.
        */}
        <button type="submit" name="points" value="1" className={CHOICE}>
          {allowNegative ? "Positive" : "Thanks"}
        </button>
        <button type="submit" name="points" value="0" className={CHOICE}>
          {allowNegative ? "Neutral" : "Just a comment"}
        </button>
        {allowNegative && (
          <button type="submit" name="points" value="-1" className={CHOICE}>
            Negative
          </button>
        )}
      </div>

      {remainingLabel !== null && (
        <p className="text-xs text-muted-foreground">{remainingLabel}</p>
      )}
    </form>
  )
}

export function WithdrawRatingForm({
  ratingId,
  userId,
  returnTo,
}: {
  ratingId: number
  userId: number
  returnTo: string
}) {
  const [state, action] = useActionState(withdrawRatingAction, EMPTY_STATE)

  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <FormError message={state.error} />
      <input type="hidden" name="ratingId" value={ratingId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Withdraw
      </button>
    </form>
  )
}
