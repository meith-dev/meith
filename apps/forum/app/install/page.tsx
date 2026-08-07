import { DEFAULT_AUTH_POLICY } from '@meith/accounts'
import {
  INSTALL_STEPS,
  blockers,
  canProceed,
  freshReport,
  warnings,
  type Check,
} from '@meith/install'
import { Alert, AlertDescription, AlertTitle, Disclosure } from '@meith/ui'
import { env } from '@meith/core'
import { MAIL_PRESETS, isUsableOrigin, normaliseOrigin } from '@meith/settings'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { InstallForm } from '@/components/install/install-form'
import { gatherPreflight, installerIsSealed, probeMail } from '@/server/install'

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
 * that is deliberate: a theme's slots are the *board's* look, but this page runs
 * before there is a board. `currentTheme()` would have to read a `themes` table
 * that does not exist yet to know which themes are even offered — and this page
 * also has to render when the database is unreachable, which is the one
 * situation where depending on anything else is a mistake (the same rule
 * `ErrorNotice` follows).
 */
export default async function InstallPage() {
  if (await installerIsSealed()) notFound()

  const checks = await gatherPreflight()
  const ready = canProceed(checks)
  /*
   * Asked again rather than dug back out of `checks`. The checks are prose for a
   * reader; deciding whether to render a form by matching a sentence in one of
   * them would be a coupling that survives exactly until somebody improves the
   * wording.
   */
  const mail = await probeMail()
  const suggestedBoardUrl = await suggestBoardUrl()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold">Install this board</h1>
        <p className="text-sm text-muted-foreground">
          This page works once. When it finishes it disables itself, and the
          address stops existing.
        </p>
      </header>

      <Preflight checks={checks} />

      {ready && (
        /*
         * The presets are handed down rather than imported by the form, which is
         * a client component: `@meith/settings` is the registry and its zod
         * schemas, and none of that belongs in a browser bundle to render eight
         * `<option>` elements. `INSTALL_STEPS` travels the same way and for the
         * same reason — importing `@meith/install` for five titles would carry
         * the whole form schema, zod included, into the browser.
         */
        <InstallForm
          presets={MAIL_PRESETS}
          steps={INSTALL_STEPS}
          /*
           * The step list as it stands before anything has run.
           *
           * The form renders the *same* component for "what this will do" and
           * "how far it got", which is what `freshReport` is for: one set of
           * states, rather than a before view and an after view that disagree
           * about what a step is.
           */
          initialReport={freshReport()}
          /*
           * The same list `runInstall` will enforce. `resolveAuthPolicy` does
           * not make this one board-configurable, and nothing has been stored
           * yet in any case, so the policy's own value is what the administrator
           * will actually be checked against.
           */
          reservedUsernames={DEFAULT_AUTH_POLICY.reservedUsernames}
          mailIsFromEnvironment={mail.source === 'environment'}
          suggestedBoardUrl={suggestedBoardUrl}
          boardUrlIsFromEnvironment={(env.APP_URL ?? '') !== ''}
        />
      )}
    </main>
  )
}

/**
 * What the environment looks like, weighted by whether anybody has to act.
 *
 * ## Why the passing checks are folded away
 *
 * This section used to render all seven findings as equal rows, five of which
 * said "ready". An installer's job is explaining what is wrong, and a screen
 * where the one warning is seventh in a list of identical boxes is not doing
 * that — it is making the reader audit a list to discover there is nothing to
 * audit. The two categories that need a decision are on the page; the rest is
 * one line saying how many were fine, openable by anybody who wants the roll
 * call. `<details>` because this page must work with scripting off (R5).
 *
 * The counts are the point of the summary line: "6 checks passed" is a claim
 * about the whole environment, and it is the sentence that lets somebody stop
 * reading.
 */
function Preflight({ checks }: { checks: readonly Check[] }) {
  const stopping = blockers(checks)
  const warned = warnings(checks)
  const passed = checks.filter((check) => check.level === 'ok')

  return (
    <section aria-labelledby="preflight" className="flex flex-col gap-3">
      <h2 id="preflight" className="font-serif text-xl font-semibold">
        Before installing
      </h2>

      {stopping.length > 0 && (
        <div role="alert" className="flex flex-col gap-2">
          {stopping.map((check) => (
            <Finding key={check.id} check={check} />
          ))}
          <p className="text-sm text-muted-foreground">
            {stopping.length === 1
              ? 'That has to be fixed before this board can be installed. Fix it, redeploy if it was an environment variable, and reload this page.'
              : `Those ${stopping.length} things have to be fixed before this board can be installed. Fix them, redeploy if they were environment variables, and reload this page.`}
          </p>
        </div>
      )}

      {/*
        Warnings are shown when they can be acted on, and folded when they cannot.
        Every one of them is written for somebody looking at the form — the mail
        warning literally says "the form below can set it up" — and when a blocker
        is present there is no form below. Two open warnings above an absent form
        is a screen asking for three decisions when only one of them is available.
      */}
      {stopping.length === 0 ? (
        <>
          {warned.map((check) => (
            <Finding key={check.id} check={check} />
          ))}
          {/*
            Said beside the warnings rather than under the button, which is where
            it used to be — a page and a half below the thing it is about,
            referring to "the warnings above" that were no longer on screen.
          */}
          {warned.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {warned.length === 1
                ? 'You can install without resolving that. Nothing will fail at the time — which is what makes it worth reading.'
                : 'You can install without resolving those. Nothing will fail at the time — which is what makes them worth reading.'}
            </p>
          )}
        </>
      ) : (
        warned.length > 0 && (
          /*
            The pronoun is about the *blockers* — what has to be fixed first — so
            it agrees with `stopping`, not with the number of warnings behind
            this summary.
          */
          <Disclosure
            summary={`${warned.length === 1 ? '1 warning' : `${warned.length} warnings`}${
              stopping.length === 1 ? ', for after that is fixed' : ', for after those are fixed'
            }`}
          >
            <div className="flex flex-col gap-2">
              {warned.map((check) => (
                <Finding key={check.id} check={check} />
              ))}
            </div>
          </Disclosure>
        )
      )}

      {passed.length > 0 && (
        <Disclosure
          summary={passed.length === 1 ? '1 check passed' : `${passed.length} checks passed`}
        >
          <ul className="flex flex-col gap-1 text-sm">
            {passed.map((check) => (
              <li key={check.id} className="flex gap-2">
                {/*
                  Decorative. The sentence beside it already says the check
                  passed, and a tick announced before every one of six lines is
                  six words nobody needs.
                */}
                <span aria-hidden className="text-muted-foreground">
                  ✓
                </span>
                <span>{check.title}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  )
}

/**
 * One finding that needs a decision, as the board's own notice.
 *
 * `Alert` maps the level onto a tone, and the tone onto `role` — `alert` for a
 * blocker, `status` for a warning — so a blocker interrupts a screen reader and
 * a warning does not. That was a hand-written `<div>` with no role at all, which
 * meant the most important sentence on the page was announced only if somebody
 * happened to be reading past it.
 */
function Finding({ check }: { check: Check }) {
  return (
    <Alert tone={check.level === 'blocker' ? 'error' : 'warning'}>
      <AlertDescription>
        {/*
          A word, not only a colour. "blocker" and "warning" are information, and
          information carried by a hue alone is absent for a substantial number
          of readers — on the one page whose entire purpose is telling somebody
          what is wrong.
        */}
        <span className="font-mono text-xs uppercase text-muted-foreground">
          {check.level}
          {' · '}
        </span>
        <AlertTitle>{check.title}</AlertTitle>
        {check.detail !== '' && <span className="mt-1 block text-muted-foreground">{check.detail}</span>}
      </AlertDescription>
    </Alert>
  )
}

/**
 * The address this page was served at, as a *prefill*.
 *
 * ## This value is attacker-controlled, and that is the point of the design
 *
 * `Host` and `X-Forwarded-Host` are request headers. Anything that can reach
 * this route can set them, and a board that wrote one straight into `board.url`
 * would put whatever an attacker chose into every future password-reset link —
 * the classic host-header poisoning bug, self-inflicted.
 *
 * What makes it safe is what happens next: it lands in a **visible, required
 * box on a form the operator submits**. They look at it, and either it says the
 * address they typed into their own browser or it does not. Confirmation is the
 * control; the suggestion is only there so the common case is one glance rather
 * than typing an origin from memory.
 *
 * Returns empty rather than a guess when there is no usable header — an empty
 * required box asks the question, where a wrong prefilled one answers it badly.
 */
async function suggestBoardUrl(): Promise<string> {
  try {
    const incoming = await headers()
    /*
     * `x-forwarded-host` first: every deployment this project documents runs
     * behind a proxy, so `host` there is the internal name the proxy dialled —
     * `web:3000` — and prefilling that would suggest an address no member can
     * reach.
     */
    const host = incoming.get('x-forwarded-host') ?? incoming.get('host') ?? ''
    if (host === '') return ''

    const proto = incoming.get('x-forwarded-proto') ?? 'https'
    const candidate = `${proto.split(',')[0]?.trim() ?? 'https'}://${host.split(',')[0]?.trim() ?? ''}`

    /* Offered only if it is something the board could actually send. */
    return isUsableOrigin(candidate) ? normaliseOrigin(candidate) : ''
  } catch {
    return ''
  }
}
