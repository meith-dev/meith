"use client"

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
  heading = "Moderator tools",
  children,
}: {
  threadId: number
  isLocked: boolean
  isSticky: boolean
  rights: { lock: boolean; stick: boolean; move: boolean; delete: boolean }
  moveTargets: readonly MoveOption[]
  heading?: string
  children?: React.ReactNode
}) {
  const [moveState, moveAction] = useActionState(threadToolAction, EMPTY_STATE)

  return (
    <section
      aria-label={heading}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3"
    >
      <span className="text-xs font-medium text-muted-foreground">{heading}</span>

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
          <button type="submit" name="tool" value="copy" className={BUTTON}>
            Copy
          </button>
        </form>
      )}

      {children}
    </section>
  )
}
