"use client"

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
  scope: "threads" | "posts"
  rights: InlineToolRights
  moveTargets: readonly InlineMoveOption[]
  returnTo: string
  splitFrom?: number | null
}) {
  const [state, action] = useActionState(inlineModerateAction, EMPTY_STATE)
  const [splitState, splitAction] = useActionState(splitSelectedAction, EMPTY_STATE)

  return (
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

        { }
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

        { }
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
