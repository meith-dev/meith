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

import { MAIL_SKIP, canProceed, mailConfigFromInstallInput, parseInstallInput } from '@meith/install'
import { redirect } from 'next/navigation'

import { gatherPreflight, installerIsSealed, runInstall } from './install'
import { sendTestMail } from './mail-test'

export interface InstallFormState {
  readonly errors?: Record<string, string>
  readonly failedStep?: { readonly id: string; readonly error: string }
  readonly values?: Record<string, string>
}

function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * Which fields survive a failed submit.
 *
 * Everything the operator typed except the two passwords. Re-rendering a
 * password into HTML puts it in a proxy log and in the browser's
 * back-forward cache, and the SMTP one is a credential for a system this board
 * does not own — so it is retyped, like the administrator's, rather than
 * echoed. Every other mail field is long, fiddly and tedious to lose.
 */
const ECHOED_FIELDS = [
  'boardName',
  'boardUrl',
  'username',
  'email',
  'mailPreset',
  'mailFrom',
  'mailHost',
  'mailPort',
  'mailSecurity',
  'mailUsername',
  'mailEndpoint',
] as const

export async function installAction(
  _previous: InstallFormState,
  form: FormData,
): Promise<InstallFormState> {
  const values = Object.fromEntries(
    ECHOED_FIELDS.map((name) => [name, field(form, name)]),
  ) as Record<string, string>

  if (await installerIsSealed()) {
    /*
     * Not an error on the form: the board exists now, so the honest response is
     * to send whoever this is to it. A message saying "already installed" on a
     * form asking for an administrator would read as a bug.
     */
    redirect('/')
  }

  /*
   * Everything the form submitted, blanks included. The schema decides what an
   * empty box means per field — `mailSecurity`'s blank is "use the preset's",
   * which `installInputSchema` handles rather than this adapter, so the two
   * cannot disagree about it.
   */
  const parsed = parseInstallInput({
    ...values,
    password: field(form, 'password'),
    mailPassword: field(form, 'mailPassword'),
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

  /*
   * Mail is proved before the first write, and a failure here installs nothing.
   *
   * This is the whole point of asking about mail on this screen rather than
   * leaving it to the panel. A wrong API key discovered *after* the install has
   * sealed itself is a board that looks finished and cannot mail anybody, and
   * the person who has to fix it is the one who has not yet seen the admin
   * panel. Discovered here, it is a message on a form beside the field that
   * caused it, with nothing to undo.
   *
   * The test goes to the address given for the administrator — the one account
   * that certainly exists a minute from now, and the one whose owner is looking
   * at this screen and can say whether it arrived.
   */
  if (parsed.value.mailPreset !== MAIL_SKIP) {
    const test = await sendTestMail({
      config: mailConfigFromInstallInput(parsed.value),
      to: parsed.value.email,
      boardName: parsed.value.boardName,
    })

    if (!test.ok) {
      return {
        errors: {
          mailPreset:
            `A test message to ${parsed.value.email} could not be sent, so nothing has ` +
            `been installed. The provider said: ${test.error ?? 'nothing at all.'}`,
        },
        values,
      }
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
