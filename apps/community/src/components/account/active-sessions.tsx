'use client'

import { useActionState } from 'react'

import { Button } from '@meith/ui/button'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { revokeOtherSessionsAction, revokeSessionAction } from '@/server/session-actions'

import { FormError } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const CARD = 'flex flex-col gap-4 rounded-lg border border-border bg-card p-5'

const ROW =
  'flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2'

export interface SessionView {
  readonly id: number
  readonly device: string
  readonly detail: string
  readonly current: boolean
}

export function ActiveSessions({
  sessions,
  copy,
}: {
  readonly sessions: readonly SessionView[]
  readonly copy: Copy
}) {
  const [revokeState, revoke] = useActionState(revokeSessionAction, EMPTY_STATE)
  const [allState, revokeAll] = useActionState(revokeOtherSessionsAction, EMPTY_STATE)

  const others = sessions.filter((session) => !session.current).length

  return (
    <section className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.sessions.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.sessions.blurb')}
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
                    {' '}
                    {fromCopy(copy, 'accountForm.sessions.thisDevice')}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">{session.detail}</span>
            </span>

            {session.current ? null : (
              <form action={revoke}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Button type="submit" variant="destructive" size="sm">
                  {fromCopy(copy, 'accountForm.sessions.signOut')}
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {others > 0 ? (
        <form action={revokeAll}>
          <Button type="submit" variant="outline" size="sm">
            {fromCopy(copy, 'accountForm.sessions.signOutElsewhere')}
          </Button>
        </form>
      ) : null}
    </section>
  )
}
