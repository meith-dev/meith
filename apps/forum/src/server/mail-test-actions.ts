'use server'

/**
 * The "send a test message" button on the mail settings screen.
 *
 * Its own action rather than a mode of the settings save, and the separation is
 * the design: **it sends through what is stored, not through what is typed.**
 *
 * A test that took the form's current values would answer a question nobody
 * asked. The operator wants to know whether *the board* can send — the same
 * configuration the worker will use at three in the morning to deliver a
 * password reset — and a test of unsaved boxes would report success for a
 * config the board is not running. Save, then test, is one more click and the
 * only order in which the answer means anything.
 *
 * The message goes to the administrator pressing the button. Not to an address
 * they type: a box for "send a test to" on an authenticated screen is an open
 * relay with extra steps — one that sends attacker-chosen text from the board's
 * verified domain, which is worth rather more to a spammer than the board is.
 */

import { isAppError, logger } from '@meith/core'
import { currentMailConfig } from '@meith/drivers'
import { canSendMail, describeMailConfig } from '@meith/settings'

import { recordAdminAction, requireAdmin } from './admin'
import { getContainer } from './container'
import { sendTestMail } from './mail-test'
import { getSettings } from './settings'
import type { FormState } from './auth-form-state'

/**
 * Takes the `useActionState` shape and uses neither argument.
 *
 * There is nothing to submit — the configuration is whatever is stored — but the
 * signature is what lets the button be a real Server Action passed straight to
 * `useActionState`, and therefore a form that still works with scripting off
 * (R5). Wrapping a no-argument function in a client closure would have read more
 * naturally and quietly cost the no-JS path.
 */
export async function sendTestMailAction(
  _previous: FormState,
  _form: FormData,
): Promise<FormState> {
  try {
    const admin = await requireAdmin()

    const config = await currentMailConfig()
    if (!canSendMail(config)) {
      return {
        error:
          'This board has no working mail configuration, so there is nothing to test. ' +
          `Right now: ${describeMailConfig(config)}.`,
      }
    }

    const account = await getContainer().accountStore.accounts.findById(admin.userId)
    if (account === null || account.email === '') {
      return { error: 'Your account has no e-mail address to send a test to.' }
    }

    const settings = await getSettings()
    const result = await sendTestMail({
      config,
      to: account.email,
      boardName: settings.get('board.name'),
      fromName: settings.get('mail.from_name'),
    })

    /*
     * Recorded either way, and without the configuration.
     *
     * A test send is a use of the board's credentials against a third party, so
     * it belongs in the audit log next to the settings change it is checking —
     * and the outcome is the interesting half: a log showing three failed tests
     * and then a settings change tells the next administrator what happened.
     */
    await recordAdminAction({
      action: 'mail.tested',
      detail: { ok: result.ok },
    })

    if (!result.ok) {
      return {
        error:
          `The message could not be sent. ${result.error ?? ''} ` +
          '(Sent through: ' +
          `${describeMailConfig(config)}.)`,
      }
    }

    return {
      notice:
        `A test message is on its way to ${account.email}. If it does not arrive within ` +
        'a minute or two, check the spam folder and then the provider’s own log — the ' +
        'board has done everything it can see.',
    }
  } catch (error) {
    if (isAppError(error)) return { error: error.message }
    logger({ module: 'mail-test' }).error({ err: String(error) }, 'test send failed')
    return { error: 'The test could not be run.' }
  }
}
