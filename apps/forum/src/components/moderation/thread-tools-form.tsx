"use client"

/**
 * F50's moderator controls (F52 will make them inline and bulk).
 *
 * One `<form>` per action rather than one form with several buttons, for the
 * reason D45 gives for delete: with scripting off a form's default submission
 * picks its *first* submit button, and grouping "unlock" with "delete" makes
 * pressing Enter in the move box a coin toss. The move box is its own form
 * because it is the only one carrying a value.
 */
import { useActionState } from "react"

import { threadToolAction } from "@/server/thread-tool-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

const BUTTON =
  "inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

function ToolButton({
  threadId,
  tool,
  label,
  destructive,
}: {
  threadId: number
  tool: string
  label: string
  destructive?: boolean
}) {
  const [state, action] = useActionState(threadToolAction, EMPTY_STATE)

  return (
    <form action={action} className="inline">
      <FormError message={state.error} />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="tool" value={tool} />
      <button
        type="submit"
        className={
          destructive === true
            ? `${BUTTON} border-destructive/40 text-destructive`
            : BUTTON
        }
      >
        {label}
      </button>
    </form>
  )
}

export interface MoveOption {
  readonly id: number
  readonly title: string
}

export function ThreadToolsForm({
  threadId,
  isLocked,
  isSticky,
  rights,
  moveTargets,
}: {
  threadId: number
  isLocked: boolean
  isSticky: boolean
  rights: { lock: boolean; stick: boolean; move: boolean; delete: boolean }
  moveTargets: readonly MoveOption[]
}) {
  const [moveState, moveAction] = useActionState(threadToolAction, EMPTY_STATE)

  return (
    <section
      aria-label="Moderator tools"
      className="mx-6 mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3"
    >
      <span className="text-xs font-medium text-muted-foreground">Moderator tools</span>

      {rights.lock && (
        <ToolButton
          threadId={threadId}
          tool={isLocked ? "unlock" : "lock"}
          label={isLocked ? "Unlock" : "Lock"}
        />
      )}
      {rights.stick && (
        <ToolButton
          threadId={threadId}
          tool={isSticky ? "unstick" : "stick"}
          label={isSticky ? "Unpin" : "Pin"}
        />
      )}
      {rights.delete && (
        <ToolButton threadId={threadId} tool="delete" label="Delete thread" destructive />
      )}

      {rights.move && moveTargets.length > 0 && (
        <form action={moveAction} className="flex items-center gap-2">
          <FormError message={moveState.error} />
          <input type="hidden" name="threadId" value={threadId} />
          <input type="hidden" name="tool" value="move" />
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
          <button type="submit" className={BUTTON}>
            Move
          </button>
        </form>
      )}
    </section>
  )
}
