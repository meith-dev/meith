import Link from "next/link"

/**
 * Chrome shared by every auth screen: a centered card on the app background.
 * Purely presentational — the forms inside are progressively enhanced client
 * components, but this shell is a plain Server Component.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Forum
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          {children}
        </div>
      </div>
    </main>
  )
}
