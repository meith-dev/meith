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
 *     cannot work: `CommunityDisplay` already renders a mark-read form and nested
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
import { splitSelectedAction } from "@/server/surgery-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"
import { BOARD_MEASURE } from "@/components/shell/measure"

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
  splitFrom,
}: {
  formId: string
  /** What the checkboxes are attached to, for the bar's own label. */
  scope: "threads" | "posts"
  rights: InlineToolRights
  moveTargets: readonly InlineMoveOption[]
  /** Where to land afterwards; validated server-side as a same-origin path. */
  returnTo: string
  /**
   * F51's split, over F52's checkboxes — the piece F51 deferred here.
   *
   * `null` when this viewer may not split, or when the surface is threads
   * rather than posts. Carries the thread id because splitting names a source,
   * which the bulk tools never have to.
   */
  splitFrom?: number | null
}) {
  const [state, action] = useActionState(inlineModerateAction, EMPTY_STATE)
  /*
   * A second hook for the split, whose dispatch is what `formAction` takes: a
   * `useActionState` reducer is `(prev, form)` and a form action is `(form)`,
   * and the dispatch React hands back is already the second shape. It also
   * gives the split its own error slot, which matters because "that selection
   * includes the opening post" is a different sentence from anything the bulk
   * tools say.
   */
  const [splitState, splitAction] = useActionState(splitSelectedAction, EMPTY_STATE)

  return (
    /*
     * The measure is on a wrapper and the panel styling stays on the form: this
     * bar has to line up with the listing whose checkboxes feed it (see
     * `BOARD_MEASURE`), and a single element cannot be both a centring container
     * and a padded panel without two `px-*` utilities fighting for one property.
     */
    <div className={`${BOARD_MEASURE} mb-6`}>
      <form
        id={formId}
        action={action}
        aria-label={`Moderate selected ${scope}`}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3"
      >
        <FormError message={state.error} />
        <FormError message={splitState.error} />
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
                name="toCommunityId"
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {moveTargets.map((community) => (
                  <option key={community.id} value={community.id}>
                    {community.title}
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
          Split, reached from the same checkboxes by `formAction`.

          Native HTML: a control has exactly one form owner, so the ticks cannot
          belong to two forms — but a submit button may redirect *its* submission
          elsewhere, which is what `formaction` is for. That is what lets one
          selection drive both the bulk tools and a split without the second
          selection mechanism F51 refused to build. React accepts a Server Action
          here for the same reason it accepts one on `<form action>`.
        */}
        {splitFrom != null && scope === "posts" && (
          <span className="flex items-center gap-2">
            <input type="hidden" name="threadId" value={splitFrom} />
            <label className="flex items-center gap-2 text-xs">
              <span className="sr-only">Title for the new thread</span>
              <input
                type="text"
                name="title"
                maxLength={150}
                placeholder="New thread title"
                className="h-8 w-48 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <button type="submit" formAction={splitAction} className={BUTTON}>
              Split out
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
    </div>
  )
}
