import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PASSKEY_LIMIT, providerLabel } from '@meith/accounts'
import { requireSlot } from '@meith/theme-kit'

import { ActiveSessions, type SessionView } from '@/components/account/active-sessions'
import { PasskeyEnrol } from '@/components/account/passkey-enrol'
import { type ActivityView, SecurityActivity } from '@/components/account/security-activity'
import {
  type LinkedIdentityView,
  LinkedSignIns,
  type OfferedProvider,
  PasskeyList,
  type PasskeyView,
} from '@/components/account/sign-in-methods'
import { TwoFactorPanel, TwoFactorSetup } from '@/components/account/two-factor-forms'
import { EmailForm, PasswordForm } from '@/components/account/usercp-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { boardAuthConfig } from '@/server/auth-config'
import { memberSecurityActivity } from '@/server/auth-events'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { memberManagedSignIns, passkeysEnabled, signInProviders } from '@/server/federation'
import { getTranslator, tr } from '@/server/i18n'
import { currentSessionId } from '@/server/session-actions'
import { currentTheme } from '@/server/theme'
import { pendingEnrolment, secondFactorPosture, twoFactorState } from '@/server/two-factor'
import { passkeyEnrolCopy } from '@/view/auth-copy'
import { authEventLabel, describeAddress, describeDevice } from '@/view/security-activity'
import { ssoNotice } from '@/view/sso-notices'
import { formatDate, formatTime } from '@/view/time'
import { userCpNotice } from '@/view/usercp'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.account-security') }
}

const NOTICES: Record<string, string> = {
  'passkey:added': 'That passkey is ready. You can sign in with it from now on.',
  'passkey:removed': 'That passkey has been removed. It can no longer reach your account.',
  'factor:setup': 'Add the key below to your authenticator app, then confirm a code.',
  'factor:off': 'Two-factor authentication is off. Your password is all that is asked for now.',
  'sessions:revoked': 'That session has been signed out.',
  'sessions:elsewhere': 'Every other session has been signed out.',
}

interface SecurityQuery {
  changed?: string
  sent?: string
  confirmed?: string
  failed?: string
  sso?: string
  passkey?: string
  factor?: string
  sessions?: string
}

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<SecurityQuery>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { memberSettings, accountStore } = getContainer()
  if (actor.userId === null || memberSettings === null) notFound()

  const settings = await memberSettings.read(actor.userId)
  if (settings === null) notFound()

  const notice = await pageNotice(query)
  const Notice = requireSlot(await currentTheme(), 'Notice')

  const manageable = await memberManagedSignIns()
  const providers = await signInProviders()
  const passkeys = await passkeysEnabled()

  const translator = await getTranslator()
  const on = (at: Date | null): string | null =>
    at === null ? null : formatDate(at, translator).label

  const account = await accountStore.accounts.findById(actor.userId)
  const hasPassword = account !== null && account.passwordHash !== null

  const posture = await secondFactorPosture(actor.userId)
  const factor = posture.offered
    ? await twoFactorState(actor.userId)
    : { enrolled: false, pending: false, recoveryCodesLeft: 0 }

  const enrolment = factor.pending ? await pendingEnrolment(actor.userId) : null

  const settingUp = factor.pending || query.factor === 'setup'

  const linked = await accountStore.identities.listForUser(actor.userId)
  const labels = new Map<string, string>(providers.map((provider) => [provider.id, provider.label]))

  const linkedView: readonly LinkedIdentityView[] = linked.map((identity) => ({
    id: identity.id,
    provider: identity.provider,
    label: labels.get(identity.provider) ?? providerLabel(identity.provider),
    detail: identity.label,
    linkedAt: on(identity.linkedAt) ?? '',
    lastUsedAt: on(identity.lastUsedAt),
  }))

  const offered: readonly OfferedProvider[] = providers
    .filter((provider) => !linked.some((identity) => identity.provider === provider.id))
    .map((provider) => ({ id: provider.id, label: provider.label }))

  const held = passkeys ? await accountStore.passkeys.listForUser(actor.userId) : []
  const passkeyView: readonly PasskeyView[] = held.map((passkey) => ({
    id: passkey.id,
    label: passkey.label,
    createdAt: on(passkey.createdAt) ?? '',
    lastUsedAt: on(passkey.lastUsedAt),
  }))

  const rightNow = new Date()
  const when = (at: Date): string => formatTime(at, rightNow, translator).label

  const thisSession = await currentSessionId()
  const sessionView: readonly SessionView[] = (
    await accountStore.sessions.listActiveForUser(actor.userId, rightNow)
  ).map((session) => ({
    id: session.id,
    device: describeDevice(session.userAgent, translator),
    address: describeAddress(session.ipPrefix),
    lastSeen: when(session.lastSeenAt),
    startedAt: when(session.createdAt),
    current: session.id === thisSession,
  }))

  const activity: readonly ActivityView[] = (await memberSecurityActivity(actor.userId)).map(
    (event) => ({
      id: event.id,
      label: authEventLabel(event.kind, translator),
      at: when(event.at),
      address: describeAddress(event.ipPrefix),
      device: describeDevice(event.userAgent, translator),
    }),
  )

  const anywhereToSignIn = providers.length > 0 || linked.length > 0

  return (
    <PanelPage
      title={await tr('page.account-security')}
      lede={await tr('page.changing-either-e-mail-address-password')}
    >
      {notice !== null && (
        <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/security" />
      )}

      <PasswordForm minLength={(await boardAuthConfig()).minPasswordLength} />
      <EmailForm email={settings.email} />

      {posture.offered &&
        (settingUp ? (
          <TwoFactorSetup enrolment={enrolment} />
        ) : (
          <TwoFactorPanel
            enrolled={factor.enrolled}
            required={posture.required}
            hasPassword={hasPassword}
            recoveryCodesLeft={factor.recoveryCodesLeft}
          />
        ))}

      {anywhereToSignIn && (
        <LinkedSignIns linked={linkedView} offered={offered} manageable={manageable} />
      )}

      {passkeys && (
        <PasskeyList passkeys={passkeyView} manageable={manageable}>
          <PasskeyEnrol copy={passkeyEnrolCopy(PASSKEY_LIMIT, await getTranslator())} />
        </PasskeyList>
      )}

      <ActiveSessions sessions={sessionView} />

      <SecurityActivity events={activity} />
    </PanelPage>
  )
}

async function pageNotice(
  query: SecurityQuery,
): Promise<{ kind: 'info' | 'warning'; message: string } | null> {
  const federated = ssoNotice(query.sso, await getTranslator())
  if (federated !== null) return federated

  for (const [key, value] of [
    ['passkey', query.passkey],
    ['factor', query.factor],
    ['sessions', query.sessions],
  ] as const) {
    if (value === undefined) continue

    const message = NOTICES[`${key}:${value}`]
    if (message !== undefined) return { kind: 'info', message }
  }

  return userCpNotice(query, await getTranslator())
}
