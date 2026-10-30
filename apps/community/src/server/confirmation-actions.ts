'use server'

import { notFound, redirect } from 'next/navigation'

import { type ActivationOutcome, MemberSettingsService } from '@meith/accounts'
import { currentRequestId } from '@meith/core/logger'

import { recordAuthEvent } from './auth-events'
import { configuredIdentity, getContainer } from './container'
import { getActor } from './context'
import { getTranslator } from './i18n'
import { emitEvent } from './plugin-view'
import { sendEmailChangeNotice } from './usercp-mail'

export async function confirmAccountAction(form: FormData): Promise<void> {
  const token = form.get('token')
  const result =
    typeof token !== 'string' || token === ''
      ? { outcome: 'invalid' as const, userId: null }
      : await (await configuredIdentity()).activateAccount(token)

  if (result.outcome === 'activated' && result.userId !== null) {
    await emitEvent(
      'user.activated',
      { userId: result.userId },
      { requestId: currentRequestId() ?? null },
    )
  }
  redirect(DESTINATION[result.outcome])
}

const DESTINATION: Record<ActivationOutcome, string> = {
  activated: '/login?activated=1',
  'awaiting-approval': '/login?confirmed=1',
  'already-active': '/login?already=1',
  banned: '/login?verify=failed',
  invalid: '/login?verify=failed',
}

export async function confirmEmailChangeAction(form: FormData): Promise<void> {
  const token = form.get('token')
  const actor = await getActor()
  const { memberSettings, accountStore } = getContainer()
  if (memberSettings === null) notFound()
  if (actor.userId === null) redirect('/login')

  const outcome =
    typeof token !== 'string' || token === ''
      ? null
      : await new MemberSettingsService({
          settings: memberSettings,
          accounts: accountStore.accounts,
          sessions: accountStore.sessions,
          remember: accountStore.remember,
          tokens: accountStore.tokens,
        }).confirmEmailChange(token, actor.userId)

  if (outcome !== null) {
    await sendEmailChangeNotice({
      stage: 'adopted',
      previousEmail: outcome.previousEmail,
      email: outcome.email,
      t: await getTranslator(),
    })
    await recordAuthEvent({ userId: outcome.userId, kind: 'email_changed' })
  }
  redirect(outcome === null ? '/usercp/security?failed=1' : '/usercp/security?confirmed=1')
}
