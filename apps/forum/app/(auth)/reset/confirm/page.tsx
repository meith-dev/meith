import Link from "next/link"
import type { Metadata } from "next"

import { ResetConfirmForm } from "@/components/auth/reset-confirm-form"
import { boardAuthConfig } from "@/server/auth-config"

export const metadata: Metadata = { title: "Choose a new password" }

export default async function ResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Invalid reset link</h1>
        <p className="text-sm text-muted-foreground">
          This link is missing its token. Request a new one to continue.
        </p>
        <Link href="/reset" className="text-sm font-medium text-foreground hover:underline">
          Request a new link
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">Enter a new password for your account.</p>
      </div>
      <ResetConfirmForm token={token} minLength={(await boardAuthConfig()).minPasswordLength} />
    </div>
  )
}
