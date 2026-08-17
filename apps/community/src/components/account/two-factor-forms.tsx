'use client'

import { useActionState } from 'react'

import { Button } from '@meith/ui/button'

import { EMPTY_STATE, type FormState } from '@/server/auth-form-state'
import {
  abandonTwoFactorAction,
  beginTwoFactorAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  replaceRecoveryCodesAction,
} from '@/server/two-factor-actions'
import { RECOVERY_CODES_FIELD } from '@/view/two-factor'

import { Field, FormError } from '../auth/form-controls'

const CARD = 'flex flex-col gap-4 rounded-lg border border-border bg-card p-5'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function RecoveryCodes({ state }: { readonly state: FormState }) {
  const codes = state.values?.[RECOVERY_CODES_FIELD]
  if (codes === undefined || codes === '') return null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-4">
      <p className="text-sm font-medium">
        Save these somewhere safe. They are shown once and never again.
      </p>
      <p className="text-xs text-muted-foreground">
        Each one signs you in exactly once, in place of a code, if you lose the device your
        authenticator app is on.
      </p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
        {codes.split('\n').map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  )
}

export function TwoFactorSetup({
  enrolment,
}: {
  readonly enrolment: { readonly secret: string; readonly uri: string } | null
}) {
  const [state, action] = useActionState(confirmTwoFactorAction, EMPTY_STATE)
  const [abandonState, abandon] = useActionState(abandonTwoFactorAction, EMPTY_STATE)

  if (state.values?.[RECOVERY_CODES_FIELD] !== undefined || enrolment === null) {
    return (
      <section className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">Your account now asks for a code</h2>
        <RecoveryCodes state={state} />
        <p className="text-xs text-muted-foreground">
          <a href="/usercp/security" className="underline underline-offset-4">
            Back to account security
          </a>{' '}
          once you have written them down.
        </p>
      </section>
    )
  }

  const { secret, uri } = enrolment

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold tracking-tight">Set up your authenticator app</h2>

      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
        <li>
          Open your authenticator app and add an account by hand, or follow{' '}
          <a href={uri} className="underline underline-offset-4">
            this link
          </a>{' '}
          on the device the app is on.
        </li>
        <li>
          Enter this key:
          <code className="mt-1 block break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
            {secret}
          </code>
        </li>
        <li>Type the six-digit code it shows, to prove the two agree.</li>
      </ol>

      <form action={action} className="flex flex-col gap-4">
        <FormError message={state.error} />
        <Field
          label="Code from your app"
          name="code"
          autoComplete="one-time-code"
          hint="Six digits. It changes every thirty seconds."
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={BUTTON}>
            Turn on
          </button>
        </div>
      </form>

      <form action={abandon}>
        <FormError message={abandonState.error} />
        <Button type="submit" variant="ghost" size="sm">
          Cancel
        </Button>
      </form>
    </section>
  )
}

export function TwoFactorPanel({
  enrolled,
  required,
  hasPassword,
  recoveryCodesLeft,
}: {
  readonly enrolled: boolean
  readonly required: boolean
  readonly hasPassword: boolean
  readonly recoveryCodesLeft: number
}) {
  const [replaceState, replace] = useActionState(replaceRecoveryCodesAction, EMPTY_STATE)
  const [disableState, disable] = useActionState(disableTwoFactorAction, EMPTY_STATE)
  const [beginState, begin] = useActionState(beginTwoFactorAction, EMPTY_STATE)

  if (!enrolled) {
    return (
      <section className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">Two-factor authentication</h2>
        <p className="text-xs text-muted-foreground">
          An authenticator app on your phone shows a six-digit code that changes every thirty
          seconds. With it switched on, your password alone is not enough to open your account —
          which is the point, because a password can leak without you ever knowing.
          {required
            ? ' This board requires it of anyone who can reach the control panel, so you will be asked for it before you can use the panel.'
            : ''}
        </p>
        <FormError message={beginState.error} />
        <form action={begin}>
          <button type="submit" className={BUTTON}>
            Set up an authenticator app
          </button>
        </form>
      </section>
    )
  }

  const proof = (which: string) =>
    hasPassword ? (
      <Field
        id={`${which}-password`}
        label="Your password"
        name="password"
        type="password"
        autoComplete="current-password"
      />
    ) : (
      <Field
        id={`${which}-code`}
        label="A current code from your app"
        name="code"
        autoComplete="one-time-code"
        hint="Your account has no password, so a code confirms this instead."
      />
    )

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold tracking-tight">Two-factor authentication</h2>
      <p className="text-sm">
        On. You have <strong>{recoveryCodesLeft}</strong> recovery{' '}
        {recoveryCodesLeft === 1 ? 'code' : 'codes'} left.
        {recoveryCodesLeft === 0
          ? ' Replace them now — without one, losing your phone means losing the account.'
          : ''}
      </p>

      <RecoveryCodes state={replaceState} />

      <form action={replace} className="flex flex-col gap-3 border-t border-border pt-4">
        <FormError message={replaceState.error} />
        <p className="text-sm font-medium">Replace your recovery codes</p>
        <p className="text-xs text-muted-foreground">
          Ten fresh ones, and the old set stops working the moment they are made.
        </p>
        {proof('replace')}
        <div>
          <button type="submit" className={BUTTON}>
            Replace recovery codes
          </button>
        </div>
      </form>

      {required ? (
        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          This board requires two-factor authentication of anyone who can reach the control panel,
          so it cannot be turned off while you hold that access.
        </p>
      ) : (
        <form action={disable} className="flex flex-col gap-3 border-t border-border pt-4">
          <FormError message={disableState.error} />
          <p className="text-sm font-medium">Turn it off</p>
          {proof('disable')}
          <div>
            <Button type="submit" variant="destructive">
              Turn off two-factor authentication
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
