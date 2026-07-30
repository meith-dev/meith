/**
 * Placeholder root page.
 *
 * Phase 2 (F30) replaces this with the real board index. For now it doubles as
 * the Checkpoint 1 auth demo: it reads the request-scoped `Actor` and shows who
 * you are, with links into the F18/F19 auth flow and a logout control.
 */
import Link from "next/link"

import { logoutAction } from "@/server/auth-actions"
import { getActor } from "@/server/context"

export default async function Page() {
  const actor = await getActor()
  const signedIn = actor.userId !== null

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Foundation
        </p>
        <h1 className="text-balance font-serif text-3xl font-semibold text-foreground">
          Forum platform
        </h1>
        <p className="max-w-prose text-pretty leading-relaxed text-muted-foreground">
          Identity is wired end to end: registration, login, logout and password
          reset, with session and remember-me handling. The board index lands in
          Phase 2.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-card-foreground">
        {signedIn ? (
          <div className="flex flex-col gap-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Signed in as </span>
              <span className="font-medium text-foreground">user #{actor.userId}</span>
              <span className="text-muted-foreground"> · {actor.state}</span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              You&apos;re browsing as a guest.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
              >
                Create account
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
