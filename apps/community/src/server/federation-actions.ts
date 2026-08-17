'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError } from '@meith/core'

import { recordAuthEvent } from './auth-events'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { assertDemoAccountChangeable } from './demo'
import {
  federationService,
  memberManagedSignIns,
  passkeyService,
  passkeysEnabled,
  signInProviders,
} from './federation'
import { formStateReporter } from './form-state-reporter'
import { text } from './form-values'

const toFormState = formStateReporter(
  'federation-actions',
  'unexpected error while changing a sign-in',
)

/**
 * Only a credential the board would actually accept today counts as a way back
 * in. A passkey on a board that has since switched passkeys off, or a link to a
 * provider an operator has turned off, opens nothing — counting it would let a
 * member unlink their way out of their own account in one click.
 */
async function usableWaysIn(userId: number): Promise<{
  readonly usablePasskeys: number
  readonly usableProviders: readonly string[]
}> {
  const providers = await signInProviders()
  const passkeys = (await passkeysEnabled())
    ? (await getContainer().accountStore.passkeys.listForUser(userId)).length
    : 0

  return {
    usablePasskeys: passkeys,
    usableProviders: providers.map((provider) => provider.id),
  }
}

async function requireOwnAccount(): Promise<{
  readonly userId: number
  readonly hasPassword: boolean
}> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

  if (!(await memberManagedSignIns())) {
    throw new ForbiddenError('This board manages sign-ins for its members.')
  }

  await assertDemoAccountChangeable(actor.userId, 'password')

  const account = await getContainer().accountStore.accounts.findById(actor.userId)
  if (account === null) throw new ForbiddenError('That account no longer exists.')

  return { userId: actor.userId, hasPassword: account.passwordHash !== null }
}

export async function unlinkIdentityAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { userId, hasPassword } = await requireOwnAccount()
    const identityId = Number(text(form, 'identityId'))
    if (!Number.isInteger(identityId)) {
      return { error: 'That sign-in could not be found.' }
    }

    await (await federationService()).unlink({
      userId,
      identityId,
      hasPassword,
      ...(await usableWaysIn(userId)),
    })

    await recordAuthEvent({ userId, kind: 'identity_unlinked' })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?sso=unlinked')
}

export async function removePasskeyAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { userId, hasPassword } = await requireOwnAccount()
    const passkeyId = Number(text(form, 'passkeyId'))
    if (!Number.isInteger(passkeyId)) {
      return { error: 'That passkey could not be found.' }
    }

    await (await passkeyService()).remove({
      userId,
      passkeyId,
      hasPassword,
      usableProviders: (await usableWaysIn(userId)).usableProviders,
    })

    await recordAuthEvent({ userId, kind: 'passkey_removed' })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?passkey=removed')
}
