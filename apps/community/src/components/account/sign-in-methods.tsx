'use client'

import { useActionState } from 'react'

import { Button } from '@meith/ui/button'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { removePasskeyAction, unlinkIdentityAction } from '@/server/federation-actions'

import { FormError } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const CARD = 'flex flex-col gap-4 rounded-lg border border-border bg-card p-5'

const ROW =
  'flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2'

export interface LinkedIdentityView {
  readonly id: number
  readonly provider: string
  readonly label: string
  readonly detail: string | null
  readonly usage: string
}

export interface PasskeyView {
  readonly id: number
  readonly label: string
  readonly usage: string
}

export interface OfferedProvider {
  readonly id: string
  readonly cta: string
}

export function LinkedSignIns({
  linked,
  offered,
  manageable,
  copy,
}: {
  readonly linked: readonly LinkedIdentityView[]
  readonly offered: readonly OfferedProvider[]
  readonly manageable: boolean
  readonly copy: Copy
}) {
  const [state, action] = useActionState(unlinkIdentityAction, EMPTY_STATE)

  return (
    <section className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.linked.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.linked.blurb')}
        </p>
      </div>

      <FormError message={state.error} />

      {linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">{fromCopy(copy, 'accountForm.linked.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {linked.map((identity) => (
            <li key={identity.id} className={ROW}>
              <span className="flex flex-col text-sm">
                <span className="font-medium">
                  {identity.label}
                  {identity.detail === null ? null : (
                    <span className="font-normal text-muted-foreground"> — {identity.detail}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{identity.usage}</span>
              </span>

              {manageable ? (
                <form action={action}>
                  <input type="hidden" name="identityId" value={identity.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    {fromCopy(copy, 'accountForm.linked.unlink')}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {manageable && offered.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {offered.map((provider) => (
            <form key={provider.id} method="post" action={`/auth/sso/${provider.id}`}>
              <input type="hidden" name="mode" value="link" />
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
              >
                {provider.cta}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function PasskeyList({
  passkeys,
  manageable,
  copy,
  children,
}: {
  readonly passkeys: readonly PasskeyView[]
  readonly manageable: boolean
  readonly copy: Copy
  readonly children?: React.ReactNode
}) {
  const [state, action] = useActionState(removePasskeyAction, EMPTY_STATE)

  return (
    <section className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.passkeys.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.passkeys.blurb')}
        </p>
      </div>

      <FormError message={state.error} />

      {passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fromCopy(copy, 'accountForm.passkeys.none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className={ROW}>
              <span className="flex flex-col text-sm">
                <span className="font-medium">{passkey.label}</span>
                <span className="text-xs text-muted-foreground">{passkey.usage}</span>
              </span>

              {manageable ? (
                <form action={action}>
                  <input type="hidden" name="passkeyId" value={passkey.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    {fromCopy(copy, 'accountForm.passkeys.remove')}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {manageable ? children : null}
    </section>
  )
}
