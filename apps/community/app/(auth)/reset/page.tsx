import Link from "next/link"
import type { Metadata } from "next"

import { ResetRequestForm } from "@/components/auth/reset-request-form"

export const metadata: Metadata = { title: "Reset password" }

export default function ResetPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>
      <ResetRequestForm />
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
