import { EN_CATALOG, sourceTranslator, type Translator } from '@meith/i18n'
import { escapeAttribute, escapeHtml } from '@meith/markdown'

import type { NotificationView } from './render'

export interface MailBrand {
  readonly boardName: string
  readonly fromName?: string
  readonly boardUrl: string
  readonly accent: string
}

export interface RenderedMail {
  readonly subject: string
  readonly text: string
  readonly html: string
}

const PREFERENCES_PATH = '/notifications/preferences'

const UNSUBSCRIBE_PATH = '/unsubscribe'

function absolute(brand: MailBrand, path: string | null): string | null {
  if (brand.boardUrl === '' || path === null) return null
  if (!path.startsWith('/')) return null
  return `${brand.boardUrl.replace(/\/+$/, '')}${path}`
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
  const target = absolute(brand, view.href)
  const preferences = absolute(brand, PREFERENCES_PATH)
  const unsubscribe =
    view.unsubscribeToken === null
      ? null
      : absolute(brand, `${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(view.unsubscribeToken)}`)

  const subject = `[${boardName}] ${view.subject}`

  const textLines = [
    t.t('notification.mail.greeting', { username: recipientName }),
    '',
    view.subject,
  ]
  if (view.body !== '') textLines.push('', view.body)
  if (target !== null) textLines.push('', target)
  textLines.push(
    '',
    '--',
    preferences === null
      ? `You are receiving this because you have an account on ${boardName}. ` +
          'Change which e-mails you receive from your notification preferences.'
      : `You are receiving this because you have an account on ${boardName}.\n` +
          `Change which e-mails you receive: ${preferences}`,
  )
  if (unsubscribe !== null) {
    textLines.push(`Unsubscribe without signing in: ${unsubscribe}`)
  }

  return {
    subject,
    text: textLines.join('\n'),
    html: html(view, brand, boardName, recipientName, target, preferences, unsubscribe, t),
  }
}

function html(
  view: NotificationView,
  brand: MailBrand,
  boardName: string,
  recipientName: string,
  target: string | null,
  preferences: string | null,
  unsubscribe: string | null,
  t: Translator,
): string {
  const accent = escapeAttribute(safeColour(brand.accent))
  const parts: string[] = [
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1c1c1c">`,
    `<p style="margin:0 0 16px">${escapeHtml(t.t('notification.mail.greeting', { username: recipientName }))}</p>`,
    `<p style="margin:0 0 16px;font-weight:600;border-left:3px solid ${accent};padding-left:12px">${escapeHtml(view.subject)}</p>`,
  ]

  if (view.body !== '') {
    for (const paragraph of view.body.split(/\n{2,}/)) {
      parts.push(`<p style="margin:0 0 16px">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    }
  }

  if (target !== null) {
    parts.push(
      `<p style="margin:0 0 24px"><a href="${escapeAttribute(target)}" ` +
        `style="color:${accent};font-weight:600">View it on ${escapeHtml(boardName)}</a></p>`,
    )
  }

  parts.push(
    `<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">`,
    `<p style="margin:0;font-size:13px;color:#666">` +
      `You are receiving this because you have an account on ${escapeHtml(boardName)}. ` +
      (preferences === null
        ? 'Change which e-mails you receive from your notification preferences.'
        : `<a href="${escapeAttribute(preferences)}" style="color:#666">Change which e-mails you receive</a>.`) +
      (unsubscribe === null
        ? ''
        : ` <a href="${escapeAttribute(unsubscribe)}" style="color:#666">Unsubscribe</a>.`) +
      `</p>`,
    `</div>`,
  )

  return parts.join('')
}

function safeColour(value: string): string {
  return /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl|oklch)a?\([0-9a-z%.,\s/-]+\))$/i.test(value.trim())
    ? value.trim()
    : '#3b5998'
}
