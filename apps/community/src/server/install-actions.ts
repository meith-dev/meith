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

import { env } from '@meith/core'
import {
  ECHOED_FIELDS,
  MAIL_SKIP,
  canProceed,
  fieldErrorsFromReport,
  firstFailure,
  installInputFromForm,
  mailConfigFromInstallInput,
  parseInstallInput,
  stepTitle,
  withEnvironmentAnswers,
  type StepOutcome,
} from '@meith/install'
import { mailConfigFromEnvironment } from '@meith/settings'
import { redirect } from 'next/navigation'

import { gatherPreflight, installerIsSealed, runInstall } from './install'
import { sendTestMail } from './mail-test'

export interface InstallFormState {
  readonly errors?: Record<string, string>
  readonly failedStep?: {
    readonly id: string
    /** What the step list beside the button calls it. The id is not for reading. */
    readonly title: string
    readonly error: string
  }
  /**
   * Every step and how it went, so the screen can show *how far it got*.
   *
   * The step list has always been data precisely so the page could report it
   * afterwards, and the page never did — it rendered a static list of five
   * titles, and a failure produced one sentence naming one step. "Migrations
   * applied, settings written, administrator not created" is the difference
   * between an operator who knows retrying is safe and one who is guessing, and
   * the handbook tells them to reason about exactly that.
   */
  readonly report?: readonly StepOutcome[]
  readonly values?: Record<string, string>
}

export async function installAction(
  _previous: InstallFormState,
  form: FormData,
): Promise<InstallFormState> {
  /*
   * Everything the form submitted, blanks included, read from the schema's own
   * field list — plus whatever the environment has already answered for boxes
   * the page therefore did not render. Both live in `@meith/install`, where
   * they are unit-tested; a list of field names maintained here is a list that
   * silently loses a field the next time the form grows one, which is how the
   * API key used to be dropped between the page and the schema.
   */
  const submitted = withEnvironmentAnswers(installInputFromForm(form), {
    boardUrl: env.APP_URL ?? null,
    mailIsFromEnvironment: mailConfigFromEnvironment(env) !== null,
  })

  const values = Object.fromEntries(
    ECHOED_FIELDS.map((name) => [name, submitted[name] ?? '']),
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
   * The schema decides what an empty box means per field — `mailSecurity`'s
   * blank is "use the preset's", which `installInputSchema` handles rather than
   * this adapter, so the two cannot disagree about it.
   */
  const parsed = parseInstallInput(submitted)
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
  const failure = firstFailure(report)

  if (failure !== null) {
    /*
     * Both, when the step refused an answer rather than breaking.
     *
     * The headline still names the step, because how far the install got is what
     * decides whether trying again is safe — and the form's summary additionally
     * lists the box to change, with a link to it. Reporting only the step is what
     * produced *"the 'admin' step failed: That username is reserved"*: true,
     * unactionable, and pointing at nothing on a form the operator has to scroll.
     */
    return {
      failedStep: {
        id: failure.id,
        title: stepTitle(failure.id),
        error: failure.error ?? 'Unknown failure.',
      },
      errors: fieldErrorsFromReport(report),
      report,
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
