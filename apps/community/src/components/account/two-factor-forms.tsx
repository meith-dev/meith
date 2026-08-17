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
import { type Copy, fromCopy } from '../shell/copy'

const CARD = 'flex flex-col gap-4 rounded-lg border border-border bg-card p-5'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function RecoveryCodes({ state, copy }: { readonly state: FormState; readonly copy: Copy }) {
  const codes = state.values?.[RECOVERY_CODES_FIELD]
  if (codes === undefined || codes === '') return null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-4">
      <p className="text-sm font-medium">{fromCopy(copy, 'accountForm.twoFactor.recoverySave')}</p>
      <p className="text-xs text-muted-foreground">
        {fromCopy(copy, 'accountForm.twoFactor.recoveryBlurb')}
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
  copy,
}: {
  readonly enrolment: { readonly secret: string; readonly uri: string } | null
  readonly copy: Copy
}) {
  const [state, action] = useActionState(confirmTwoFactorAction, EMPTY_STATE)
  const [abandonState, abandon] = useActionState(abandonTwoFactorAction, EMPTY_STATE)

  if (state.values?.[RECOVERY_CODES_FIELD] !== undefined || enrolment === null) {
    return (
      <section className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.twoFactor.enabledTitle')}
        </h2>
        <RecoveryCodes state={state} copy={copy} />
        <p className="text-xs text-muted-foreground">
          {copy['accountForm.twoFactor.writtenDownLead']}
          <a href="/usercp/security" className="underline underline-offset-4">
            {fromCopy(copy, 'accountForm.twoFactor.backToSecurity')}
          </a>
          {copy['accountForm.twoFactor.writtenDownTail']}
        </p>
      </section>
    )
  }

  const { secret, uri } = enrolment

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold tracking-tight">
        {fromCopy(copy, 'accountForm.twoFactor.setupTitle')}
      </h2>

      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
        <li>
          {copy['accountForm.twoFactor.step1Lead']}
          <a href={uri} className="underline underline-offset-4">
            {fromCopy(copy, 'accountForm.twoFactor.step1Link')}
          </a>
          {copy['accountForm.twoFactor.step1Tail']}
        </li>
        <li>
          {fromCopy(copy, 'accountForm.twoFactor.step2')}
          <code className="mt-1 block break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
            {secret}
          </code>
        </li>
        <li>{fromCopy(copy, 'accountForm.twoFactor.step3')}</li>
      </ol>

      <form action={action} className="flex flex-col gap-4">
        <FormError message={state.error} />
        <Field
          label={fromCopy(copy, 'accountForm.twoFactor.codeLabel')}
          name="code"
          autoComplete="one-time-code"
          hint={fromCopy(copy, 'accountForm.twoFactor.codeHint')}
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={BUTTON}>
            {fromCopy(copy, 'accountForm.twoFactor.turnOn')}
          </button>
        </div>
      </form>

      <form action={abandon}>
        <FormError message={abandonState.error} />
        <Button type="submit" variant="ghost" size="sm">
          {fromCopy(copy, 'accountForm.twoFactor.cancel')}
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
  copy,
}: {
  readonly enrolled: boolean
  readonly required: boolean
  readonly hasPassword: boolean
  readonly recoveryCodesLeft: number
  readonly copy: Copy
}) {
  const [replaceState, replace] = useActionState(replaceRecoveryCodesAction, EMPTY_STATE)
  const [disableState, disable] = useActionState(disableTwoFactorAction, EMPTY_STATE)
  const [beginState, begin] = useActionState(beginTwoFactorAction, EMPTY_STATE)

  if (!enrolled) {
    return (
      <section className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.twoFactor.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.twoFactor.blurb')}
          {required ? <> {copy['accountForm.twoFactor.requiredBlurb']}</> : null}
        </p>
        <FormError message={beginState.error} />
        <form action={begin}>
          <button type="submit" className={BUTTON}>
            {fromCopy(copy, 'accountForm.twoFactor.begin')}
          </button>
        </form>
      </section>
    )
  }

  const proof = (which: string) =>
    hasPassword ? (
      <Field
        id={`${which}-password`}
        label={fromCopy(copy, 'accountForm.twoFactor.passwordLabel')}
        name="password"
        type="password"
        autoComplete="current-password"
      />
    ) : (
      <Field
        id={`${which}-code`}
        label={fromCopy(copy, 'accountForm.twoFactor.codeProofLabel')}
        name="code"
        autoComplete="one-time-code"
        hint={fromCopy(copy, 'accountForm.twoFactor.codeProofHint')}
      />
    )

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold tracking-tight">
        {fromCopy(copy, 'accountForm.twoFactor.title')}
      </h2>
      <p className="text-sm">
        {copy['accountForm.twoFactor.statusLead']}
        <strong>{copy['accountForm.twoFactor.codes']}</strong>
        {copy['accountForm.twoFactor.statusTail']}
        {recoveryCodesLeft === 0 ? <> {copy['accountForm.twoFactor.exhausted']}</> : null}
      </p>

      <RecoveryCodes state={replaceState} copy={copy} />

      <form action={replace} className="flex flex-col gap-3 border-t border-border pt-4">
        <FormError message={replaceState.error} />
        <p className="text-sm font-medium">
          {fromCopy(copy, 'accountForm.twoFactor.replaceTitle')}
        </p>
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.twoFactor.replaceBlurb')}
        </p>
        {proof('replace')}
        <div>
          <button type="submit" className={BUTTON}>
            {fromCopy(copy, 'accountForm.twoFactor.replaceSubmit')}
          </button>
        </div>
      </form>

      {required ? (
        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.twoFactor.requiredOff')}
        </p>
      ) : (
        <form action={disable} className="flex flex-col gap-3 border-t border-border pt-4">
          <FormError message={disableState.error} />
          <p className="text-sm font-medium">{fromCopy(copy, 'accountForm.twoFactor.offTitle')}</p>
          {proof('disable')}
          <div>
            <Button type="submit" variant="destructive">
              {fromCopy(copy, 'accountForm.twoFactor.offSubmit')}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
