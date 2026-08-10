import Link from "next/link"
import type { Metadata } from "next"

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Create your account</h1>
        <p className="text-sm text-muted-foreground">Join the discussion.</p>
      </div>
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
      <p className="text-sm text-muted-foreground">
        {"Already have an account? "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
