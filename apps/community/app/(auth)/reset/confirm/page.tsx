import type { Metadata } from "next"

import { AuthPage } from "@/components/auth/auth-page"
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
      <AuthPage
        title="Invalid reset link"
        lede="This link is missing its token. Request a new one to continue."
        links={[{ label: "Request a new link", href: "/reset", lead: null }]}
      />
    )
  }

  return (
    <AuthPage
      title="Choose a new password"
      lede="Enter a new password for your account."
    >
      <ResetConfirmForm token={token} minLength={(await boardAuthConfig()).minPasswordLength} />
    </AuthPage>
  )
}
