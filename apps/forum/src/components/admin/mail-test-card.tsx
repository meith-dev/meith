'use client'

/**
 * The mail group's one control that is not a setting.
 *
 * Everything else on `/admin/settings` is generated from F08's registry, and
 * this deliberately is not: it does not store a value, it spends the board's
 * credentials against a third party, and its result is a fact about the world
 * rather than about the database. Generating it would mean the registry growing
 * a concept of "a setting that is a button", which is one setting's convenience
 * paid for by every other setting's definition.
 *
 * It is a separate `<form>` from the settings form below it, and has to be —
 * nested forms are not valid HTML, and a submit inside the settings form would
 * save the fields on its way past. The consequence is stated on the button:
 * **save first, then test**, because the test sends through what is stored.
 */

import { useActionState } from 'react'

import { sendTestMailAction } from '@/server/mail-test-actions'
import { EMPTY_STATE, type FormState } from '@/server/auth-form-state'

export function MailTestCard({
  summary,
  sends,
  fromEnvironment,
}: {
  /** `describeMailConfig` output. Names a host, never a credential. */
  summary: string
  /** Whether a message sent right now would leave the board. */
  sends: boolean
  /** `MAIL_DRIVER` is set, so the fields below this card are inert. */
  fromEnvironment: boolean
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    sendTestMailAction,
    EMPTY_STATE,
  )

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-lg font-semibold">How this board sends mail</h2>
        <p className="text-sm">
          {summary}
          {!sends && (
            <span className="text-muted-foreground">
              {' '}
              — so password resets, registration confirmations and notification e-mail
              reach nobody.
            </span>
          )}
        </p>
      </div>

      {fromEnvironment && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <code>MAIL_DRIVER</code> is set in this deployment’s environment, which
          overrides everything below. The fields on this screen are stored but not used
          until <code>MAIL_DRIVER</code> is unset and the board redeployed.
        </p>
      )}

      {state.error !== undefined && (
        <p
          role="alert"
          className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      {state.notice !== undefined && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
        >
          {state.notice}
        </p>
      )}

      <form action={submit} className="flex flex-col gap-2">
        <div>
          <button
            type="submit"
            disabled={pending || !sends}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending ? 'Sending…' : 'Send a test message to me'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Goes to the address on your own account, through the configuration the board has{' '}
          <em>saved</em> — so save any changes below first, or you will be testing the old
          one. A provider that rejects the message says why, and that message is shown
          here verbatim.
        </p>
      </form>
    </section>
  )
}
