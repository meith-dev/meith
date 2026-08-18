import type { Metadata } from 'next'

import type { AuthLinkModel } from '@meith/theme-kit'

import { AuthPage } from '@/components/auth/auth-page'
import { LoginForm } from '@/components/auth/login-form'
import { PasskeySignIn } from '@/components/auth/passkey-sign-in'
import { SsoButtons } from '@/components/auth/sso-buttons'
import { passkeysEnabled, signInProviders } from '@/server/federation'
import { getTranslator, tr } from '@/server/i18n'
import { registrationOpen } from '@/server/registration'
import { loginFormCopy, passkeyCopy, ssoButtonModels, ssoButtonsCopy } from '@/view/auth-copy'
import { ssoNotice } from '@/view/sso-notices'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.sign') }
}

const NOTICE_KEYS: Record<string, string> = {
  installed: 'authNotice.installed',
  registered: 'authNotice.registered',
  reset: 'authNotice.reset',
  activated: 'authNotice.activated',
  confirmed: 'authNotice.confirmed',
  already: 'authNotice.already',
}

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
  const t = await getTranslator()
  const federated = ssoNotice(params.sso, t)
  const noticeKey = params.installed
    ? NOTICE_KEYS.installed
    : params.registered
      ? NOTICE_KEYS.registered
      : params.reset
        ? NOTICE_KEYS.reset
        : params.activated
          ? NOTICE_KEYS.activated
          : params.confirmed
            ? NOTICE_KEYS.confirmed
            : params.already
              ? NOTICE_KEYS.already
              : undefined
  const notice = noticeKey === undefined ? undefined : t.t(noticeKey)

  const links: AuthLinkModel[] = [
    { label: t.t('authLink.forgotPassword'), href: '/reset', lead: null },
    { label: t.t('authLink.needConfirmation'), href: '/verify/resend', lead: null },
  ]

  if (await registrationOpen()) {
    links.push({
      label: t.t('authLink.createAccount'),
      href: '/register',
      lead: t.t('authLink.newHere'),
    })
  }

  const providers = await signInProviders()
  const passkeys = await passkeysEnabled()

  const alert =
    params.verify === 'failed'
      ? t.t('authNotice.verifyFailed')
      : federated?.kind === 'warning'
        ? federated.message
        : null

  return (
    <AuthPage
      title={await tr('page.welcome-back')}
      lede={await tr('page.sign-account')}
      alert={alert}
      links={links}
    >
      <div className="flex flex-col gap-4">
        <SsoButtons
          providers={ssoButtonModels(providers, t)}
          next={params.next}
          copy={ssoButtonsCopy(t)}
        />
        <LoginForm
          next={params.next}
          notice={federated?.kind === 'info' ? federated.message : notice}
          copy={loginFormCopy(t)}
        />
        {passkeys ? <PasskeySignIn next={params.next} copy={passkeyCopy(t)} /> : null}
      </div>
    </AuthPage>
  )
}
