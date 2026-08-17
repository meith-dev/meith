import type { Metadata } from 'next'

import { AuthPage } from '@/components/auth/auth-page'
import { RegisterForm } from '@/components/auth/register-form'
import { SsoButtons } from '@/components/auth/sso-buttons'
import { issueChallenge } from '@/server/antispam'
import { boardAuthConfig } from '@/server/auth-config'
import { signInProviders } from '@/server/federation'
import { getTranslator, tr } from '@/server/i18n'
import { termsAcceptance } from '@/server/legal'
import { registrationFields } from '@/server/profile-fields'
import { registrationOpen } from '@/server/registration'
import { registerFormCopy, ssoButtonModels, ssoButtonsCopy } from '@/view/auth-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.create-account') }
}

export default async function RegisterPage() {
  if (!(await registrationOpen())) {
    return (
      <AuthPage
        title={await tr('authNotice.registrationClosed')}
        lede={await tr('authNotice.registrationClosedLede')}
        links={[
          {
            label: await tr('authLink.signIn'),
            href: '/login',
            lead: await tr('authLink.alreadyMember'),
          },
        ]}
      />
    )
  }

  const issued = await issueChallenge()

  const { minPasswordLength, usernameMin, usernameMax } = await boardAuthConfig()

  const terms = await termsAcceptance()

  const customFields = (await registrationFields()).map((field) => ({
    ...field,
    value: '',
    required: true,
  }))

  const t = await getTranslator()

  return (
    <AuthPage
      title={await tr('page.create-account-2')}
      lede={await tr('page.join-discussion')}
      links={[
        {
          label: await tr('authLink.signIn'),
          href: '/login',
          lead: await tr('authLink.alreadyHaveAccount'),
        },
      ]}
    >
      <div className="flex flex-col gap-4">
        <SsoButtons
          providers={ssoButtonModels(await signInProviders(), t)}
          lede={await tr('authForm.sso.registerLede')}
          copy={ssoButtonsCopy(t)}
        />
        <RegisterForm
          customFields={customFields}
          limits={{ minPasswordLength, usernameMin, usernameMax }}
          terms={terms}
          challenge={{
            prompt: issued.challenge?.prompt ?? null,
            token: issued.challenge?.token ?? '',
            honeypot: issued.honeypot,
            issuedAt: issued.issuedAt,
          }}
          copy={registerFormCopy({ minPasswordLength, usernameMin, usernameMax }, t)}
        />
      </div>
    </AuthPage>
  )
}
