import { INSTALL_STEPS, blockers, canProceed, warnings } from '@meith/install'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { InstallForm } from '@/components/install/install-form'
import { gatherPreflight, installerIsSealed } from '@/server/install'

export const metadata: Metadata = { title: 'Install' }

/*
 * Never cached, and never prerendered. The whole page is a report on the current
 * environment, and a cached copy would tell the next operator about the last
 * one's database.
 */
export const dynamic = 'force-dynamic'

/**
 * F83 — the one-time installer.
 *
 * ## Why this is a 404 rather than a "already installed" page
 *
 * Once sealed, `/install` does not exist. An informative page here would confirm
 * to anybody who asks that this is a forum-software board and that it has been
 * installed — and more usefully to them, that the route *was* reachable. A 404 is
 * the same answer the board gives for any path it does not serve, which is the
 * only answer that says nothing.
 *
 * ## No theme
 *
 * The installer renders its own markup rather than going through the theme, and
 * that is deliberate: `activeTheme` resolves at module load and a theme's slots
 * are the *board's* look, but this page runs before there is a board. It also has
 * to render when the database is unreachable, which is the one situation where
 * depending on anything else is a mistake (the same rule `ErrorNotice` follows).
 */
export default async function InstallPage() {
  if (await installerIsSealed()) notFound()

  const checks = await gatherPreflight()
  const ready = canProceed(checks)

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold">Install this board</h1>
        <p className="text-sm text-muted-foreground">
          This page works once. When it finishes it disables itself, and the
          address stops existing.
        </p>
      </header>

      <section aria-labelledby="preflight" className="flex flex-col gap-3">
        <h2 id="preflight" className="font-serif text-xl font-semibold">
          Before installing
        </h2>

        <ul className="flex flex-col gap-2">
          {checks.map((check) => (
            <li
              key={check.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                check.level === 'blocker'
                  ? 'border-destructive bg-destructive/5'
                  : check.level === 'warning'
                    ? 'border-thread-pinned bg-muted'
                    : 'border-border'
              }`}
            >
              <p className="font-medium">
                {/*
                  A word, not only a colour. "blocker" and "warning" are
                  information, and information carried by a hue alone is absent
                  for a substantial number of readers — on the one page whose
                  entire purpose is telling somebody what is wrong.
                */}
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  {check.level === 'ok' ? 'ready' : check.level}
                  {' · '}
                </span>
                {check.title}
              </p>
              {check.detail !== '' && (
                <p className="mt-1 text-muted-foreground">{check.detail}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps" className="flex flex-col gap-3">
        <h2 id="steps" className="font-serif text-xl font-semibold">
          What installing does
        </h2>
        <ol className="flex flex-col gap-2 text-sm">
          {INSTALL_STEPS.map((step, index) => (
            <li key={step.id} className="flex gap-3">
              <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
              <span>
                <span className="font-medium">{step.title}</span>
                <span className="block text-muted-foreground">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {ready ? (
        <InstallForm />
      ) : (
        <p
          role="alert"
          className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-sm"
        >
          {blockers(checks).length === 1
            ? 'One thing above has to be fixed before this board can be installed.'
            : `${blockers(checks).length} things above have to be fixed before this board can be installed.`}{' '}
          Fix them, redeploy if they were environment variables, and reload this page.
        </p>
      )}

      {ready && warnings(checks).length > 0 && (
        <p className="text-sm text-muted-foreground">
          You can install with the warnings above unresolved. Nothing will fail at
          the time — that is what makes them worth reading.
        </p>
      )}
    </main>
  )
}
