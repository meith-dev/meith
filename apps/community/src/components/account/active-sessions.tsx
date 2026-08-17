"use client"

import { useActionState } from "react"

import { Button } from "@meith/ui/button"

import {
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "@/server/session-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

const CARD = "flex flex-col gap-4 rounded-lg border border-border bg-card p-5"

const ROW =
  "flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2"

export interface SessionView {
  readonly id: number
  readonly device: string
  readonly address: string
  readonly lastSeen: string
  readonly startedAt: string
  readonly current: boolean
}

export function ActiveSessions({ sessions }: { readonly sessions: readonly SessionView[] }) {
  const [revokeState, revoke] = useActionState(revokeSessionAction, EMPTY_STATE)
  const [allState, revokeAll] = useActionState(revokeOtherSessionsAction, EMPTY_STATE)

  const others = sessions.filter((session) => !session.current).length

  return (
    <section className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Where you are signed in</h2>
        <p className="text-xs text-muted-foreground">
          Every device holding a live sign-in to your account. Signing one out takes
          effect at once, and whoever holds it has to sign in again.
        </p>
      </div>

      <FormError message={revokeState.error ?? allState.error} />

      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <li key={session.id} className={ROW}>
            <span className="flex flex-col text-sm">
              <span className="font-medium">
                {session.device}
                {session.current ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    — this device
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {session.address} · started {session.startedAt} · last seen{" "}
                {session.lastSeen}
              </span>
            </span>

            {session.current ? null : (
              <form action={revoke}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Sign out
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {others > 0 ? (
        <form action={revokeAll}>
          <Button type="submit" variant="outline" size="sm">
            Sign out everywhere else
          </Button>
        </form>
      ) : null}
    </section>
  )
}
