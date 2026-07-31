/**
 * F55 — a notification as an e-mail.
 *
 * ## Safe by construction, like F36
 *
 * The HTML part is assembled from tag literals plus values that have been
 * through `escapeHtml`/`escapeAttribute` — the same argument `@forum/bbcode`
 * makes, reusing the same two functions rather than restating them. There is no
 * step at which attacker markup exists in this output to be cleaned, which
 * matters more here than on the board: a username reaches a mail client that
 * this project does not control and cannot audit.
 *
 * ## Themed, within what mail can actually carry
 *
 * "Themed" is the board's *branding* — its name, its links, and the accent
 * colour the board actually runs — inlined as attributes. It is not the theme's
 * stylesheet, and that is a limitation of e-mail rather than a shortcut: mail
 * clients strip `<style>` blocks and do not implement CSS custom properties, so
 * a token cascade arrives as no styling at all. The brand is therefore resolved
 * to plain values by the caller and passed in.
 *
 * ## The text part is not a fallback
 *
 * Both parts are always produced, and the text part is written to be read. A
 * forum notification is short, and plenty of people read mail as text.
 *
 * ## Relative links are never emitted
 *
 * A board-relative path in an e-mail is a dead link. When no absolute origin is
 * configured (`APP_URL` unset), the message goes out **without** its link
 * rather than with a broken one, and says where to look instead.
 */
import { escapeAttribute, escapeHtml } from '@forum/bbcode'

import type { NotificationView } from './render'

/** The board, as an e-mail is allowed to know it. */
export interface MailBrand {
  readonly boardName: string
  /** Absolute origin, no trailing slash. Empty when none is configured. */
  readonly boardUrl: string
  /**
   * The board's accent colour as a CSS colour, already resolved from the
   * theme's tokens and any database override (F26).
   */
  readonly accent: string
}

/** Exactly the shape `MailDriver.send` takes, without importing the driver. */
export interface RenderedMail {
  readonly subject: string
  readonly text: string
  readonly html: string
}

/** Where a member manages what they receive. Referenced from every message. */
const PREFERENCES_PATH = '/notifications/preferences'

/** Join an origin and a board-relative path, or return null when there is none. */
function absolute(brand: MailBrand, path: string | null): string | null {
  if (brand.boardUrl === '' || path === null) return null
  if (!path.startsWith('/')) return null
  return `${brand.boardUrl.replace(/\/+$/, '')}${path}`
}

export function renderNotificationMail(input: {
  readonly view: NotificationView
  readonly brand: MailBrand
  readonly recipientName: string
}): RenderedMail {
  const { view, brand, recipientName } = input

  const boardName = brand.boardName === '' ? 'the forum' : brand.boardName
  const target = absolute(brand, view.href)
  const preferences = absolute(brand, PREFERENCES_PATH)

  /*
   * The board's name prefixes every subject. Filters and threading are built on
   * subjects, and a member on three boards needs to know which one wrote.
   */
  const subject = `[${boardName}] ${view.subject}`

  const textLines = [
    `Hello ${recipientName},`,
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

  return { subject, text: textLines.join('\n'), html: html(view, brand, boardName, recipientName, target, preferences) }
}

function html(
  view: NotificationView,
  brand: MailBrand,
  boardName: string,
  recipientName: string,
  target: string | null,
  preferences: string | null,
): string {
  /*
   * Table-free, inline-styled, and deliberately plain. Every construct here is
   * one that renders the same in a webmail client and in a twenty-year-old
   * desktop one; anything cleverer is a layout that only works where it was
   * tested.
   */
  const accent = escapeAttribute(safeColour(brand.accent))
  const parts: string[] = [
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1c1c1c">`,
    `<p style="margin:0 0 16px">Hello ${escapeHtml(recipientName)},</p>`,
    `<p style="margin:0 0 16px;font-weight:600;border-left:3px solid ${accent};padding-left:12px">${escapeHtml(view.subject)}</p>`,
  ]

  if (view.body !== '') {
    /*
     * The body is plain text with newlines, so paragraphs are split rather than
     * `white-space: pre-wrap` — which several clients drop.
     */
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
      `</p>`,
    `</div>`,
  )

  return parts.join('')
}

/**
 * Constrain the accent to a colour literal this file is willing to emit.
 *
 * The value arrives from `themes.token_overrides`, which is board configuration
 * — F26 validates it on the way in, and this is the second gate on the way out.
 * Escaping alone is not enough inside a `style` attribute: `url(...)` and
 * `expression(...)` are the reason CSS in mail has its own history of
 * vulnerabilities, and neither survives this test.
 */
function safeColour(value: string): string {
  return /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl|oklch)a?\([0-9a-z%.,\s/-]+\))$/i.test(value.trim())
    ? value.trim()
    : '#3b5998'
}
