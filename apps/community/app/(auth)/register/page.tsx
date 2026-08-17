import type { Metadata } from 'next'

import { AuthPage } from '@/components/auth/auth-page'
import { RegisterForm } from '@/components/auth/register-form'
import { SsoButtons } from '@/components/auth/sso-buttons'
import { issueChallenge } from '@/server/antispam'
import { boardAuthConfig } from '@/server/auth-config'
import { signInProviders } from '@/server/federation'
import { termsAcceptance } from '@/server/legal'
import { registrationFields } from '@/server/profile-fields'
import {
  REGISTRATION_CLOSED_LEDE,
  REGISTRATION_CLOSED_TITLE,
  registrationOpen,
} from '@/server/registration'

export const metadata: Metadata = { title: 'Create account' }

export default async function RegisterPage() {
  if (!(await registrationOpen())) {
    return (
      <AuthPage
        title={REGISTRATION_CLOSED_TITLE}
        lede={REGISTRATION_CLOSED_LEDE}
        links={[{ label: 'Sign in', href: '/login', lead: 'Already a member?' }]}
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

  return (
    <AuthPage
      title="Create your account"
      lede="Join the discussion."
      links={[{ label: 'Sign in', href: '/login', lead: 'Already have an account?' }]}
    >
      <div className="flex flex-col gap-4">
        <SsoButtons
          providers={await signInProviders()}
          lede={
            'Registering this way creates an account here from the address that provider ' +
            'holds for you, and tells them you are a member. No password is set, and you ' +
            'can add one later.'
          }
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
        />
      </div>
    </AuthPage>
  )
}
