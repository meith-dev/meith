import Link from "next/link"
import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = { title: "Sign in" }

const NOTICES: Record<string, string> = {
  /*
   * Where `/install` sends the new administrator, and the last thing the
   * installer does that the operator can see.
   *
   * The redirect has always carried `?installed=1`; this page had no entry for
   * it, so the one screen confirming that a five-step irreversible install
   * *worked* was an ordinary sign-in form. The installer is gone by then — it
   * answers 404 — so there was nothing left anywhere that said the board
   * existed.
   */
  installed:
    "Your board is installed. Sign in with the administrator account you just created.",
  registered: "Account created. You can sign in now.",
  reset: "Your password has been changed. Sign in with your new password.",
  activated: "Your address is confirmed. You can sign in now.",
  /*
   * The `both` policy: the address is proven and an administrator still has to
   * approve the account. Saying so is the difference between waiting and
   * assuming something is broken.
   */
  confirmed:
    "Your address is confirmed. An administrator will review your account before you can sign in.",
  already: "That account is already active. Sign in below.",
}

/**
 * One sentence for every way a confirmation link can fail.
 *
 * A forged token, a used one and an expired one are deliberately not told
 * apart: the next step is the same for all three, and distinguishing them would
 * tell whoever is holding a token whether it was ever real.
 */
const VERIFY_FAILED =
  "That confirmation link is no longer valid. Ask for a new one below."

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
  }>
}) {
  const params = await searchParams
  const failedVerification = params.verify === "failed"
  /* First, because it is the only one that can be somebody's first ever visit. */
  const notice = params.installed
    ? NOTICES.installed
    : params.registered
      ? NOTICES.registered
      : params.reset
        ? NOTICES.reset
        : params.activated
          ? NOTICES.activated
          : params.confirmed
            ? NOTICES.confirmed
            : params.already
              ? NOTICES.already
              : undefined

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your account.</p>
      </div>
      {failedVerification && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
        >
          {VERIFY_FAILED}
        </p>
      )}
      <LoginForm next={params.next} notice={notice} />
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <Link href="/reset" className="hover:text-foreground">
          Forgot your password?
        </Link>
        <Link href="/verify/resend" className="hover:text-foreground">
          Need a new confirmation link?
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
