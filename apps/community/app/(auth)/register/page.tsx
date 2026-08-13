import type { Metadata } from "next"

import { AuthPage } from "@/components/auth/auth-page"
import { RegisterForm } from "@/components/auth/register-form"
import { issueChallenge } from "@/server/antispam"
import { boardAuthConfig } from "@/server/auth-config"
import { registrationFields } from "@/server/profile-fields"

export const metadata: Metadata = { title: "Create account" }

export default async function RegisterPage() {
  const issued = await issueChallenge()

  const { minPasswordLength, usernameMin, usernameMax } = await boardAuthConfig()

  const customFields = (await registrationFields()).map((field) => ({
    ...field,
    value: "",
    required: true,
  }))

  return (
    <AuthPage
      title="Create your account"
      lede="Join the discussion."
      links={[{ label: "Sign in", href: "/login", lead: "Already have an account?" }]}
    >
      <RegisterForm
        customFields={customFields}
        limits={{ minPasswordLength, usernameMin, usernameMax }}
        challenge={{
          prompt: issued.challenge?.prompt ?? null,
          token: issued.challenge?.token ?? '',
          honeypot: issued.honeypot,
          issuedAt: issued.issuedAt,
        }}
      />
    </AuthPage>
  )
}
