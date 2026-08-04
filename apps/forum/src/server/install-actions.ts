'use server'

/**
 * F83 — the install action.
 *
 * Two gates before anything is written, and they are not redundant:
 *
 *  1. **the seal**, so a finished board's installer cannot be re-run;
 *  2. **the preflight**, re-evaluated here rather than trusted from the page.
 *
 * The second is the one that matters. The page ran a preflight to decide what to
 * render, and a form submission is a *separate request* — the board may have been
 * installed by somebody else in between, which on a public URL somebody found by
 * guessing is not a hypothetical. Re-authorising in the action rather than
 * trusting the render is the same rule every other Server Action here follows.
 */

import { canProceed, parseInstallInput } from '@meith/install'
import { redirect } from 'next/navigation'

import { gatherPreflight, installerIsSealed, runInstall } from './install'

export interface InstallFormState {
  readonly errors?: Record<string, string>
  readonly failedStep?: { readonly id: string; readonly error: string }
  readonly values?: Record<string, string>
}

function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

export async function installAction(
  _previous: InstallFormState,
  form: FormData,
): Promise<InstallFormState> {
  const values = {
    boardName: field(form, 'boardName'),
    username: field(form, 'username'),
    email: field(form, 'email'),
  }

  if (await installerIsSealed()) {
    /*
     * Not an error on the form: the board exists now, so the honest response is
     * to send whoever this is to it. A message saying "already installed" on a
     * form asking for an administrator would read as a bug.
     */
    redirect('/')
  }

  const parsed = parseInstallInput({
    ...values,
    password: field(form, 'password'),
  })
  if (!parsed.ok) return { errors: parsed.errors, values }

  if (!canProceed(await gatherPreflight())) {
    return {
      errors: {
        form: 'The board is not ready to install. Reload this page for the current checks.',
      },
      values,
    }
  }

  const report = await runInstall(parsed.value)
  const failure = report.find((step) => step.status === 'failed')

  if (failure !== undefined) {
    return {
      failedStep: { id: failure.id, error: failure.error ?? 'Unknown failure.' },
      values,
    }
  }

  /*
   * Outside any try/catch: `redirect` works by throwing, so catching it would
   * turn a successful install into a form that silently re-renders.
   *
   * To the sign-in page rather than to the board: the administrator has an
   * account and no session, and a fresh board's index tells them nothing they
   * need. The query parameter is what the sign-in page uses to say so.
   */
  redirect('/login?installed=1')
}
