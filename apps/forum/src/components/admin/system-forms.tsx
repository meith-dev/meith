"use client"

import { useActionState } from "react"

import {
  clearCacheAction,
  pruneSessionsAction,
  pruneTokensAction,
  recountAction,
  reindexSearchAction,
  retryJobAction,
} from "@/server/system-admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"

function Result({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
      {children}
    </p>
  )
}

export function PruneSessionsForm({ prunable }: { prunable: number }) {
  const [state, action] = useActionState(pruneSessionsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === "pruned" && (
        <Result>{state.values?.removed} session rows removed.</Result>
      )}
      <div>
        <SubmitButton>Prune {prunable} expired session{prunable === 1 ? "" : "s"}</SubmitButton>
      </div>
    </form>
  )
}

export function PruneTokensForm() {
  const [state, action] = useActionState(pruneTokensAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === "pruned" && (
        <Result>{state.values?.removed} token rows removed.</Result>
      )}
      <div>
        <SubmitButton>Prune expired tokens</SubmitButton>
      </div>
    </form>
  )
}

export function RecountForm() {
  const [state, action] = useActionState(recountAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === "ran" && (
        <Result>
          {state.values?.corrected} counter{state.values?.corrected === "1" ? "" : "s"}{" "}
          corrected in this batch. Press again to continue — it resumes where it
          stopped.
        </Result>
      )}
      <div>
        <SubmitButton>Run one recount batch</SubmitButton>
      </div>
    </form>
  )
}

export function ClearCacheForm() {
  const [state, action] = useActionState(clearCacheAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === "cleared" && <Result>Cleared {state.values?.tag}.</Result>}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">What to clear</span>
        <select
          name="what"
          defaultValue="forums"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="forums">The forum tree</option>
          <option value="permissions">Resolved permissions</option>
        </select>
      </label>

      <div>
        <SubmitButton>Clear</SubmitButton>
      </div>
    </form>
  )
}

export function RetryJobForm() {
  const [state, action] = useActionState(retryJobAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <FormError message={state.error} />
      {state.notice === "retried" && <Result>Back on the queue.</Result>}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Job id</span>
        <input
          name="jobId"
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          required
        />
        <span className="text-xs text-muted-foreground">
          One at a time. A job dead-letters after exhausting its attempts, so the
          reason is usually still true — retrying every one puts the same
          failures straight back.
        </span>
      </label>

      <div>
        <SubmitButton>Retry</SubmitButton>
      </div>
    </form>
  )
}

export function ReindexSearchForm({ pending }: { pending: number }) {
  const [state, action] = useActionState(reindexSearchAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === "finished" && (
        <Result>
          {state.values?.indexed} indexed. Every post on the board is searchable.
        </Result>
      )}
      {state.notice === "more" && (
        <Result>
          {state.values?.indexed} indexed, {state.values?.pending} still to go.
          Press again — it resumes where it stopped.
        </Result>
      )}
      <div>
        <SubmitButton>
          {pending === 0 ? "Nothing to index" : `Index the next batch of ${pending}`}
        </SubmitButton>
      </div>
    </form>
  )
}
