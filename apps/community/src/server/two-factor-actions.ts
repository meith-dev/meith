'use server'

import { redirect } from 'next/navigation'

import { verifyPassword } from '@meith/accounts'
import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { RECOVERY_CODES_FIELD } from '@/view/two-factor'

import { recordAuthEvent } from './auth-events'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { assertDemoAccountChangeable } from './demo'
import { formStateReporter } from './form-state-reporter'
import { text } from './form-values'
import { getSettingsUncached } from './settings'
import { secondFactorPosture, twoFactorOffered, twoFactorService } from './two-factor'

const toFormState = formStateReporter(
  'two-factor-actions',
  'unexpected error while changing two-factor authentication',
)

async function requireOwnAccount(): Promise<{
  readonly userId: number
  readonly hasPassword: boolean
}> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

  if (!(await twoFactorOffered())) {
    throw new ForbiddenError(msg('error.app.board-offer-two-factor-authentication'))
  }

  await assertDemoAccountChangeable(actor.userId, 'sign-in method')

  const account = await getContainer().accountStore.accounts.findById(actor.userId)
  if (account === null) throw new ForbiddenError(msg('error.app.account-longer-exists'))

  return { userId: actor.userId, hasPassword: account.passwordHash !== null }
}

export async function beginTwoFactorAction(_prev: FormState, _form: FormData): Promise<FormState> {
  try {
    const { userId } = await requireOwnAccount()

    const service = twoFactorService()
    if (service === null) throw new ForbiddenError(msg('error.app.board-seal-secret'))

    const name = (await getSettingsUncached()).get('board.name')
    await service.beginEnrolment(userId, name.trim() === '' ? 'Meith' : name)
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?factor=setup')
}

export async function abandonTwoFactorAction(
  _prev: FormState,
  _form: FormData,
): Promise<FormState> {
  try {
    const { userId } = await requireOwnAccount()

    const service = twoFactorService()
    if (service !== null) await service.abandonEnrolment(userId)
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security')
}

export async function confirmTwoFactorAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { userId } = await requireOwnAccount()

    const service = twoFactorService()
    if (service === null) throw new ForbiddenError(msg('error.app.board-seal-secret'))

    const codes = await service.confirmEnrolment({ userId, code: text(form, 'code') })
    await recordAuthEvent({ userId, kind: 'second_factor_enabled' })

    return { notice: 'saved', values: { [RECOVERY_CODES_FIELD]: codes.join('\n') } }
  } catch (err) {
    return toFormState(err)
  }
}

export async function replaceRecoveryCodesAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const { userId, hasPassword } = await requireOwnAccount()

    const service = twoFactorService()
    if (service === null) throw new ForbiddenError(msg('error.app.board-seal-secret'))

    await assertStillThem({ userId, hasPassword, form, service })

    const codes = await service.replaceRecoveryCodes(userId)
    await recordAuthEvent({ userId, kind: 'recovery_codes_replaced' })

    return { notice: 'saved', values: { [RECOVERY_CODES_FIELD]: codes.join('\n') } }
  } catch (err) {
    return toFormState(err)
  }
}

export async function disableTwoFactorAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { userId, hasPassword } = await requireOwnAccount()

    const service = twoFactorService()
    if (service === null) throw new ForbiddenError(msg('error.app.board-seal-secret'))

    await assertStillThem({ userId, hasPassword, form, service })

    const posture = await secondFactorPosture(userId)
    await service.disable({ userId, required: posture.required })
    await recordAuthEvent({ userId, kind: 'second_factor_disabled' })
  } catch (err) {
    return toFormState(err)
  }

  redirect('/usercp/security?factor=off')
}

/**
 * Weakening an account asks for the thing being weakened. An account with a
 * password gives it; one without — signed in by a provider or a passkey —
 * gives a current code instead, which proves the same possession.
 */
async function assertStillThem(input: {
  readonly userId: number
  readonly hasPassword: boolean
  readonly form: FormData
  readonly service: NonNullable<ReturnType<typeof twoFactorService>>
}): Promise<void> {
  if (input.hasPassword) {
    const account = await getContainer().accountStore.accounts.findById(input.userId)
    const password = text(input.form, 'password')

    if (password === '' || !(await verifyPassword(password, account?.passwordHash))) {
      throw new ValidationError(msg('error.app.current-password'))
    }
    return
  }

  const outcome = await input.service.verify({
    userId: input.userId,
    code: text(input.form, 'code'),
  })

  if (outcome.status !== 'ok') {
    throw new ValidationError(msg('error.app.enter-current-code-from-authenticator'))
  }
}
