'use server'

import { isAppError, logger } from '@meith/core'
import { currentMailConfig } from '@meith/drivers'
import { canSendMail, describeMailConfig } from '@meith/settings'

import { recordAdminAction, requireAdmin } from './admin'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getTranslator, tr } from './i18n'
import { sendTestMail } from './mail-test'
import { getSettings } from './settings'

export async function sendTestMailAction(
  _previous: FormState,
  _form: FormData,
): Promise<FormState> {
  try {
    const admin = await requireAdmin()
    const t = await getTranslator()

    const config = await currentMailConfig()
    if (!canSendMail(config)) {
      return {
        error:
          (await tr('notice.app.board-working-mail-configuration-there')) +
          t.t('mailTest.currentConfiguration', { configuration: describeMailConfig(config) }),
      }
    }

    const account = await getContainer().accountStore.accounts.findById(admin.userId)
    if (account === null || account.email === '') {
      return { error: await tr('notice.app.account-e-mail-address-send-test') }
    }

    const settings = await getSettings()
    const result = await sendTestMail({
      config,
      to: account.email,
      boardName: settings.get('board.name'),
      t,
      fromName: settings.get('mail.from_name'),
    })

    await recordAdminAction({
      action: 'mail.tested',
      detail: { ok: result.ok },
    })

    if (!result.ok) {
      return {
        error: t.t('mailTest.action.failed', {
          error: result.error ?? '',
          configuration: describeMailConfig(config),
        }),
      }
    }

    return {
      notice: t.t('mailTest.action.sent', { email: account.email }),
    }
  } catch (error) {
    if (isAppError(error)) return { error: error.message }
    logger({ module: 'mail-test' }).error({ err: String(error) }, 'test send failed')
    return { error: await tr('notice.app.test-could-run') }
  }
}
