import Link from "next/link"
import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = { title: "Sign in" }

const NOTICES: Record<string, string> = {
  registered: "Account created. You can sign in now.",
  reset: "Your password has been changed. Sign in with your new password.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; registered?: string; reset?: string }>
}) {
  const params = await searchParams
  const notice = params.registered
    ? NOTICES.registered
    : params.reset
      ? NOTICES.reset
      : undefined

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your account.</p>
      </div>
      <LoginForm next={params.next} notice={notice} />
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <Link href="/reset" className="hover:text-foreground">
          Forgot your password?
        </Link>
        <span>
          {"New here? "}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            Create an account
          </Link>
        </span>
      </div>
    </div>
  )
}
