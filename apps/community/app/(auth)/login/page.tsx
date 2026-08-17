import type { Metadata } from 'next'

import type { AuthLinkModel } from '@meith/theme-kit'

import { AuthPage } from '@/components/auth/auth-page'
import { LoginForm } from '@/components/auth/login-form'
import { PasskeySignIn } from '@/components/auth/passkey-sign-in'
import { SsoButtons } from '@/components/auth/sso-buttons'
import { passkeysEnabled, signInProviders } from '@/server/federation'
import { getTranslator } from '@/server/i18n'
import { registrationOpen } from '@/server/registration'
import { ssoNotice } from '@/view/sso-notices'

export const metadata: Metadata = { title: 'Sign in' }

const NOTICES: Record<string, string> = {
  installed: 'Your board is installed. Sign in with the administrator account you just created.',
  registered: 'Account created. You can sign in now.',
  reset: 'Your password has been changed. Sign in with your new password.',
  activated: 'Your address is confirmed. You can sign in now.',
  confirmed:
    'Your address is confirmed. An administrator will review your account before you can sign in.',
  already: 'That account is already active. Sign in below.',
}

const VERIFY_FAILED = 'That confirmation link is no longer valid. Ask for a new one below.'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string
    installed?: string
    registered?: string
    reset?: string
    activated?: string
    confirmed?: string
    already?: string
    verify?: string
    sso?: string
  }>
}) {
  const params = await searchParams
  const federated = ssoNotice(params.sso, await getTranslator())
  const notice = params.installed
    ? NOTICES.installed
    : params.registered
      ? NOTICES.registered
      : params.reset
        ? NOTICES.reset
        : params.activated
          ? NOTICES.activated
          : params.confirmed
            ? NOTICES.confirmed
            : params.already
              ? NOTICES.already
              : undefined

  const links: AuthLinkModel[] = [
    { label: 'Forgot your password?', href: '/reset', lead: null },
    { label: 'Need a new confirmation link?', href: '/verify/resend', lead: null },
  ]

  if (await registrationOpen()) {
    links.push({ label: 'Create an account', href: '/register', lead: 'New here?' })
  }

  const providers = await signInProviders()
  const passkeys = await passkeysEnabled()

  const alert =
    params.verify === 'failed'
      ? VERIFY_FAILED
      : federated?.kind === 'warning'
        ? federated.message
        : null

  return (
    <AuthPage title="Welcome back" lede="Sign in to your account." alert={alert} links={links}>
      <div className="flex flex-col gap-4">
        <SsoButtons providers={providers} next={params.next} />
        <LoginForm
          next={params.next}
          notice={federated?.kind === 'info' ? federated.message : notice}
        />
        {passkeys ? <PasskeySignIn next={params.next} /> : null}
      </div>
    </AuthPage>
  )
}
