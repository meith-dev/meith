"use client"

/**
 * F52's moderation bar.
 *
 * A client component only for `useActionState`, exactly like every other form
 * on this board. Everything it does works with scripting off:
 *
 *   - The checkboxes are **not inside this form**. They are rendered by the
 *     theme, inside the listing, and associated by the HTML `form` attribute —
 *     `<input form="inline-moderation">` — which is a form-owner relationship
 *     the browser honours natively and which `new FormData(form)` picks up
 *     after hydration. The alternative, wrapping the listing in a `<form>`,
 *     cannot work: `ForumDisplay` already renders a mark-read form and nested
 *     forms are not parsed.
 *   - Each tool is a submit button carrying `name="tool"`, which is how a
 *     no-JS form expresses "one form, several verbs" without a line of script.
 *   - Move is a `<select>` next to its own button rather than a second form,
 *     because a second form could not own the same checkboxes.
 *
 * The one consequence worth naming: with several submit buttons, pressing
 * Enter inside the move `<select>` submits the *first* button in the form. So
 * the order below is deliberate — the reversible tools come first and the
 * destructive one comes last, which is the same rule D45 applied to the post
 * form and F50 applied to the thread bar.
 */
import { useActionState } from "react"

import { inlineModerateAction } from "@/server/inline-moderation-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

const BUTTON =
  "inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

export interface InlineMoveOption {
  readonly id: number
  readonly title: string
}

export interface InlineToolRights {
  readonly approve: boolean
  readonly lock: boolean
  readonly stick: boolean
  readonly move: boolean
  readonly delete: boolean
}

export function InlineModerationForm({
  formId,
  scope,
  rights,
  moveTargets,
  returnTo,
}: {
  formId: string
  /** What the checkboxes are attached to, for the bar's own label. */
  scope: "threads" | "posts"
  rights: InlineToolRights
  moveTargets: readonly InlineMoveOption[]
  /** Where to land afterwards; validated server-side as a same-origin path. */
  returnTo: string
}) {
  const [state, action] = useActionState(inlineModerateAction, EMPTY_STATE)

  return (
    <form
      id={formId}
      action={action}
      aria-label={`Moderate selected ${scope}`}
      className="mx-6 mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3"
    >
      <FormError message={state.error} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <span className="text-xs font-medium text-muted-foreground">
        With selected {scope}:
      </span>

      {rights.approve && (
        <button type="submit" name="tool" value="approve" className={BUTTON}>
          Approve
        </button>
      )}
      {rights.lock && scope === "threads" && (
        <>
          <button type="submit" name="tool" value="lock" className={BUTTON}>
            Lock
          </button>
          <button type="submit" name="tool" value="unlock" className={BUTTON}>
            Unlock
          </button>
        </>
      )}
      {rights.stick && scope === "threads" && (
        <>
          <button type="submit" name="tool" value="stick" className={BUTTON}>
            Pin
          </button>
          <button type="submit" name="tool" value="unstick" className={BUTTON}>
            Unpin
          </button>
        </>
      )}
      {rights.delete && (
        <button type="submit" name="tool" value="restore" className={BUTTON}>
          Restore
        </button>
      )}

      {rights.move && scope === "threads" && moveTargets.length > 0 && (
        <span className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <span className="sr-only">Move to</span>
            <select
              name="toForumId"
              className="h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {moveTargets.map((forum) => (
                <option key={forum.id} value={forum.id}>
                  {forum.title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" name="tool" value="move" className={BUTTON}>
            Move
          </button>
        </span>
      )}

      {/*
        Last on purpose. It is the only irreversible-looking button here (it is
        a soft delete, and Restore is right there, but it is the one a
        mis-aimed Enter should not reach), so it is never the form's default
        submit button.
      */}
      {rights.delete && (
        <button
          type="submit"
          name="tool"
          value="delete"
          className={`${BUTTON} border-destructive/40 text-destructive`}
        >
          Delete
        </button>
      )}
    </form>
  )
}
