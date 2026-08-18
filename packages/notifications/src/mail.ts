import { EN_CATALOG, sourceTranslator, type Translator } from '@meith/i18n'
import {
  absoluteUrl,
  type MailBody,
  type MailBrand,
  type MailFooterLine,
  type RenderedMail,
  renderMail,
} from '@meith/mail'

import type { NotificationView } from './render'

export type { MailBrand, RenderedMail }

const PREFERENCES_PATH = '/notifications/preferences'

const UNSUBSCRIBE_PATH = '/unsubscribe'

function footer(input: {
  readonly boardName: string
  readonly preferences: string | null
  readonly unsubscribe: string | null
  readonly t: Translator
}): readonly MailFooterLine[] {
  const { t } = input
  const lines: MailFooterLine[] = [
    { text: t.t('mail.footer.account', { board: input.boardName }) },
    input.preferences === null
      ? { text: t.t('mail.footer.preferencesNoLink') }
      : { text: t.t('mail.footer.preferences'), href: input.preferences },
  ]

  if (input.unsubscribe !== null) {
    lines.push({ text: t.t('mail.footer.unsubscribe'), href: input.unsubscribe })
  }

  return lines
}

export function renderNotificationMail(input: {
  readonly view: NotificationView
  readonly brand: MailBrand
  readonly recipientName: string
  readonly t?: Translator
}): RenderedMail {
  const { view, brand, recipientName } = input
  const t = input.t ?? sourceTranslator(EN_CATALOG)

  const boardName =
    brand.boardName === '' ? t.t('notification.mail.boardFallback') : brand.boardName

  const target = absoluteUrl(brand.boardUrl, view.href)
  const preferences = absoluteUrl(brand.boardUrl, PREFERENCES_PATH)
  const unsubscribe =
    view.unsubscribeToken === null
      ? null
      : absoluteUrl(
          brand.boardUrl,
          `${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(view.unsubscribeToken)}`,
        )

  const body: MailBody = {
    title: view.subject,
    greeting: t.t('notification.mail.greeting', { username: recipientName }),
    paragraphs: view.body === '' ? [] : view.body.split(/\n{2,}/),
    ...(target === null
      ? {}
      : { action: { label: t.t('mail.notification.action', { board: boardName }), href: target } }),
    footer: footer({ boardName, preferences, unsubscribe, t }),
  }

  return renderMail({ brand: { ...brand, boardName }, body, t })
}
