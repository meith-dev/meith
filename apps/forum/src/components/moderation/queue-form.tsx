"use client"

/**
 * The queue's bulk form (F48).
 *
 * A client component only for `useActionState`. Everything it does works with
 * scripting off: native checkboxes named `item`, and two submit buttons whose
 * `name="decision"` carries which button was pressed — which is how a no-JS
 * form expresses "one form, two actions" without any script at all.
 */
import { useActionState } from "react"

import { moderateQueueAction } from "@/server/moderation-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

export interface QueueFormRow {
  readonly value: string
  readonly kindLabel: string
  readonly forumTitle: string
  readonly threadTitle: string
  readonly href: string
  readonly authorUsername: string
  readonly authorHref: string | null
  readonly excerpt: string
  readonly postedAt: { readonly iso: string; readonly label: string }
}

export function QueueForm({ rows }: { rows: readonly QueueFormRow[] }) {
  const [state, action] = useActionState(moderateQueueAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.value} className="rounded-lg border border-border bg-card p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="item"
                value={row.value}
                className="mt-1 size-4 shrink-0"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-medium">{row.kindLabel}</span>
                  <span className="text-muted-foreground">in {row.forumTitle}</span>
                  <a href={row.href} className="text-primary hover:underline">
                    {row.threadTitle}
                  </a>
                </span>
                <span className="text-xs text-muted-foreground">
                  by{" "}
                  {row.authorHref === null ? (
                    row.authorUsername
                  ) : (
                    <a href={row.authorHref} className="hover:text-foreground">
                      {row.authorUsername}
                    </a>
                  )}{" "}
                  · <time dateTime={row.postedAt.iso}>{row.postedAt.label}</time>
                </span>
                {/*
                  Plain text, never markup. This is the one screen that shows
                  content nobody has approved, and rendering it here would give
                  a spammer's markup its first audience — in the browser of the
                  person deciding whether it should exist at all.
                */}
                <span className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {row.excerpt}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="decision"
          value="approve"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Approve selected
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          className="inline-flex h-10 items-center justify-center rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Reject selected
        </button>
      </div>
    </form>
  )
}
