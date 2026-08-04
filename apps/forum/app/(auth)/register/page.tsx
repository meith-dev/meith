import Link from "next/link"
import type { Metadata } from "next"

import { RegisterForm } from "@/components/auth/register-form"
import { issueChallenge } from "@/server/antispam"
import { registrationFields } from "@/server/profile-fields"

export const metadata: Metadata = { title: "Create account" }

export default async function RegisterPage() {
  /*
   * F59's required-at-registration fields. Resolved on the server because the
   * answer depends on board configuration and on what the default member group
   * may edit — neither of which a client component can be trusted to decide.
   */
  /* F46. Issued per render, so the fill-time stamp is this visitor's. */
  const issued = await issueChallenge()

  const customFields = (await registrationFields()).map((field) => ({
    ...field,
    value: "",
    required: true,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Create your account</h1>
        <p className="text-sm text-muted-foreground">Join the discussion.</p>
      </div>
      <RegisterForm
        customFields={customFields}
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
