import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PASSKEY_LIMIT, providerLabel } from '@meith/accounts'
import { requireSlot } from '@meith/theme-kit'

import { PanelPage } from '@/components/shell/panel-page'
import { PasskeyEnrol } from '@/components/account/passkey-enrol'
import {
  LinkedSignIns,
  PasskeyList,
  type LinkedIdentityView,
  type OfferedProvider,
  type PasskeyView,
} from '@/components/account/sign-in-methods'
import { EmailForm, PasswordForm } from '@/components/account/usercp-forms'
import { boardAuthConfig } from '@/server/auth-config'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import {
  memberManagedSignIns,
  passkeysEnabled,
  signInProviders,
} from '@/server/federation'
import { currentTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { ssoNotice } from '@/view/sso-notices'
import { formatDate } from '@/view/time'
import { userCpNotice } from '@/view/usercp'

export const metadata: Metadata = { title: 'Account security' }

const PASSKEY_NOTICES: Record<string, string> = {
  added: 'That passkey is ready. You can sign in with it from now on.',
  removed: 'That passkey has been removed. It can no longer reach your account.',
}

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{
    changed?: string
    sent?: string
    confirmed?: string
    failed?: string
    sso?: string
    passkey?: string
  }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { memberSettings, accountStore } = getContainer()
  if (actor.userId === null || memberSettings === null) notFound()

  const settings = await memberSettings.read(actor.userId)
  if (settings === null) notFound()

  const federated = ssoNotice(query.sso)
  const passkeyNotice =
    query.passkey === undefined ? undefined : PASSKEY_NOTICES[query.passkey]

  const notice =
    federated !== null
      ? federated
      : passkeyNotice === undefined
        ? userCpNotice(query)
        : ({ kind: 'info', message: passkeyNotice } as const)

  const Notice = requireSlot(await currentTheme(), 'Notice')

  const manageable = await memberManagedSignIns()
  const providers = await signInProviders()
  const passkeys = await passkeysEnabled()

  const { timezone } = await getViewerPreferences()
  const on = (at: Date | null): string | null =>
    at === null ? null : formatDate(at, timezone).label

  const linked = await accountStore.identities.listForUser(actor.userId)
  const labels = new Map<string, string>(
    providers.map((provider) => [provider.id, provider.label]),
  )

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

  const anywhereToSignIn = providers.length > 0 || linked.length > 0

  return (
    <PanelPage
      title="Account security"
      lede="Changing either your e-mail address or your password needs the password you have now. Everything else here is a way into your account that does not use it."
    >
      {notice !== null && (
        <Notice
          kind={notice.kind}
          message={notice.message}
          dismissHref="/usercp/security"
        />
      )}

      <PasswordForm minLength={(await boardAuthConfig()).minPasswordLength} />
      <EmailForm email={settings.email} />

      {anywhereToSignIn && (
        <LinkedSignIns linked={linkedView} offered={offered} manageable={manageable} />
      )}

      {passkeys && (
        <PasskeyList passkeys={passkeyView} manageable={manageable}>
          <PasskeyEnrol limit={PASSKEY_LIMIT} />
        </PasskeyList>
      )}
    </PanelPage>
  )
}
