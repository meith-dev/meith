"use client"

/**
 * F51's merge and split controls.
 *
 * Both carry a value, so both are their own `<form>` for the reason F50's move
 * box is — with scripting off, Enter in a text box submits the form's *first*
 * submit button, and a shared form would make pressing Enter in the split title
 * a coin toss between splitting and destroying a thread.
 *
 * Split offers a `<select>` of the posts on this page rather than asking for a
 * number: the moderator is looking at those posts, and a select cannot name a
 * post that is not one of them. Merge has to ask for a number, because the
 * thread to merge into is by definition not on this screen — the action treats
 * that number as untrusted and re-authorises the community it lands in.
 */
import { useActionState } from "react"

import { mergeThreadAction, splitThreadAction } from "@/server/surgery-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

const BUTTON =
  "inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
const FIELD =
  "h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/** A post the moderator can split from: never the thread's opening post. */
export interface SplitPoint {
  readonly id: number
  readonly number: number
  readonly author: string
}

export function ThreadSurgeryForm({
  threadId,
  rights,
  splitPoints,
}: {
  threadId: number
  rights: { merge: boolean; split: boolean }
  splitPoints: readonly SplitPoint[]
}) {
  const [splitState, splitAction] = useActionState(splitThreadAction, EMPTY_STATE)
  const [mergeState, mergeAction] = useActionState(mergeThreadAction, EMPTY_STATE)

  return (
    <>
      {rights.split && splitPoints.length > 0 && (
        <form action={splitAction} className="flex flex-wrap items-center gap-2">
          <FormError message={splitState.error} />
          <input type="hidden" name="threadId" value={threadId} />
          <label className="flex items-center gap-2 text-xs">
            <span className="sr-only">Split from post</span>
            <select name="fromPostId" className={FIELD}>
              {splitPoints.map((point) => (
                <option key={point.id} value={point.id}>
                  #{point.number} by {point.author}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="sr-only">New thread title</span>
            <input
              type="text"
              name="title"
              required
              minLength={3}
              maxLength={150}
              placeholder="New thread title"
              className={`${FIELD} w-48`}
            />
          </label>
          <button type="submit" className={BUTTON}>
            Split
          </button>
        </form>
      )}

      {rights.merge && (
        <form action={mergeAction} className="flex flex-wrap items-center gap-2">
          <FormError message={mergeState.error} />
          <input type="hidden" name="threadId" value={threadId} />
          <label className="flex items-center gap-2 text-xs">
            <span className="sr-only">Merge into thread number</span>
            <input
              type="number"
              name="targetThreadId"
              required
              min={1}
              step={1}
              placeholder="Merge into thread #"
              className={`${FIELD} w-40`}
            />
          </label>
          {/*
            * `formNoValidate` is deliberately absent and the destructive styling
            * is: this thread stops existing, and the moderator should be able to
            * see which of the two boxes is the one that ends something.
            */}
          <button
            type="submit"
            className={`${BUTTON} border-destructive/40 text-destructive`}
          >
            Merge away
          </button>
        </form>
      )}
    </>
  )
}
