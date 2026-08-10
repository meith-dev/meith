'use server'

import { isAppError, logger } from '@meith/core'
import { currentMailConfig } from '@meith/drivers'
import { canSendMail, describeMailConfig } from '@meith/settings'

import { recordAdminAction, requireAdmin } from './admin'
import { getContainer } from './container'
import { sendTestMail } from './mail-test'
import { getSettings } from './settings'
import type { FormState } from './auth-form-state'

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
