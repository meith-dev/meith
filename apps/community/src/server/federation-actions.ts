'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError } from '@meith/core'

import { getActor } from './context'
import { getContainer } from './container'
import { assertDemoAccountChangeable } from './demo'
import { federationService, memberManagedSignIns, passkeyService } from './federation'
import { formStateReporter } from './form-state-reporter'
import { text } from './form-values'
import type { FormState } from './auth-form-state'

const toFormState = formStateReporter(
  'federation-actions',
  'unexpected error while changing a sign-in',
)

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

export async function unlinkIdentityAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const { userId, hasPassword } = await requireOwnAccount()
    const identityId = Number(text(form, 'identityId'))
    if (!Number.isInteger(identityId)) {
      return { error: 'That sign-in could not be found.' }
    }

    const { accountStore } = getContainer()

    await (await federationService()).unlink({
      userId,
      identityId,
      hasPassword,
      passkeyCount: (await accountStore.passkeys.listForUser(userId)).length,
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?sso=unlinked')
}

export async function removePasskeyAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const { userId, hasPassword } = await requireOwnAccount()
    const passkeyId = Number(text(form, 'passkeyId'))
    if (!Number.isInteger(passkeyId)) {
      return { error: 'That passkey could not be found.' }
    }

    await (await passkeyService()).remove({ userId, passkeyId, hasPassword })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?passkey=removed')
}
