import type { Translator } from '@meith/i18n'
import { escapeAttribute, escapeHtml } from '@meith/markdown'

import type { MailBrand } from './brand'
import type { MailScheme } from './palette'

export interface MailLink {
  readonly label: string
  readonly href: string
}

export interface MailFooterLine {
  readonly text: string
  readonly href?: string | null
}

export interface MailBody {
  readonly title: string
  readonly greeting?: string | null
  readonly paragraphs: readonly string[]
  readonly action?: MailLink | null
  readonly note?: string | null
  readonly footer?: readonly MailFooterLine[]
}

export interface RenderedMail {
  readonly subject: string
  readonly text: string
  readonly html: string
}

const CARD_WIDTH = 600

const LOGO_HEIGHT = 36

export function safeHref(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!/^https?:\/\/[^\s<>\x22\x27]+$/i.test(trimmed)) return null

  return trimmed
}

function paragraphs(body: MailBody): readonly string[] {
  return body.paragraphs.filter((paragraph) => paragraph.trim() !== '')
}

function footerLines(body: MailBody): readonly MailFooterLine[] {
  return (body.footer ?? []).filter((line) => line.text.trim() !== '')
}

function preheader(body: MailBody): string {
  return (paragraphs(body)[0] ?? body.title).replace(/\s+/g, ' ').slice(0, 140)
}

export function renderMailText(input: {
  readonly brand: MailBrand
  readonly body: MailBody
  readonly boardName: string
}): string {
  const { body } = input
  const lines: string[] = []

  if (typeof body.greeting === 'string' && body.greeting.trim() !== '') {
    lines.push(body.greeting, '')
  }
  lines.push(body.title)

  for (const paragraph of paragraphs(body)) lines.push('', paragraph)

  const action = body.action === null || body.action === undefined ? null : body.action
  const actionHref = action === null ? null : safeHref(action.href)
  if (action !== null && actionHref !== null) lines.push('', `${action.label}: ${actionHref}`)

  if (typeof body.note === 'string' && body.note.trim() !== '') lines.push('', body.note)

  const footer = footerLines(body)
  if (footer.length > 0) {
    lines.push('', '--')
    for (const line of footer) {
      const href = safeHref(line.href)
      lines.push(href === null ? line.text : `${line.text}: ${href}`)
    }
  }

  return lines.join('\n')
}

function styleSheet(dark: MailScheme): string {
  return [
    `.m-page{margin:0;padding:0;width:100%!important}`,
    `img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}`,
    `a{text-decoration:none}`,
    `.m-logo-dark{display:none}`,
    `@media (max-width:620px){`,
    `.m-pad{padding-left:20px!important;padding-right:20px!important}`,
    `}`,
    `@media (prefers-color-scheme:dark){`,
    `.m-page,.m-page-cell{background-color:${dark.page}!important}`,
    `.m-card{background-color:${dark.card}!important;border-color:${dark.border}!important}`,
    `.m-band{background-color:${dark.band}!important;border-color:${dark.border}!important}`,
    `.m-title,.m-text,.m-wordmark{color:${dark.text}!important}`,
    `.m-muted,.m-foot,.m-foot a{color:${dark.muted}!important}`,
    `.m-rule{border-color:${dark.border}!important}`,
    `.m-action{background-color:${dark.primary}!important}`,
    `.m-action a,.m-action-label{color:${dark.primaryText}!important}`,
    `.m-link{color:${dark.text}!important;text-decoration-color:${dark.primary}!important}`,
    `.m-accent{background-color:${dark.primary}!important}`,
    `.m-logo-light{display:none!important}`,
    `.m-logo-dark{display:inline-block!important}`,
    `}`,
  ].join('')
}

function masthead(brand: MailBrand, boardName: string, light: MailScheme, font: string): string {
  const home = safeHref(brand.boardUrl)
  const wordmark =
    `<span class="m-wordmark" style="font-family:${font};font-size:19px;` +
    `font-weight:700;letter-spacing:-0.01em;color:${light.text}">${escapeHtml(boardName)}</span>`

  const inner =
    brand.logo === null
      ? wordmark
      : logoImage(brand.logo.src, brand.logo.alt, `m-logo-light`) +
        (brand.logo.darkSrc === null
          ? ''
          : logoImage(brand.logo.darkSrc, brand.logo.alt, `m-logo-dark`))

  return home === null
    ? inner
    : `<a href="${escapeAttribute(home)}" style="text-decoration:none">${inner}</a>`
}

function logoImage(src: string, alt: string, className: string): string {
  const href = safeHref(src)
  if (href === null) return ''

  return (
    `<img src="${escapeAttribute(href)}" alt="${escapeAttribute(alt)}" height="${LOGO_HEIGHT}" ` +
    `class="${className}" style="display:inline-block;height:${LOGO_HEIGHT}px;` +
    `max-height:${LOGO_HEIGHT}px;width:auto;border:0">`
  )
}

function actionButton(
  action: MailLink,
  href: string,
  light: MailScheme,
  font: string,
  radius: number,
): string {
  return (
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0">` +
    `<tr><td class="m-action" align="center" ` +
    `style="background-color:${light.primary};border-radius:${radius}px">` +
    `<a href="${escapeAttribute(href)}" class="m-action-label" ` +
    `style="display:inline-block;padding:13px 26px;font-family:${font};font-size:15px;` +
    `font-weight:600;line-height:1;color:${light.primaryText};text-decoration:none">` +
    `${escapeHtml(action.label)}</a></td></tr></table>`
  )
}

export function renderMailHtml(input: {
  readonly brand: MailBrand
  readonly body: MailBody
  readonly boardName: string
  readonly subject: string
  readonly t: Translator
}): string {
  const { brand, body, boardName, t } = input
  const { light, bodyFont, headingFont, radius } = {
    light: brand.palette.light,
    bodyFont: brand.palette.bodyFont,
    headingFont: brand.palette.headingFont,
    radius: brand.palette.radius,
  }

  const text = `font-family:${bodyFont};font-size:15px;line-height:1.6;color:${light.text}`
  const parts: string[] = []

  parts.push(
    `<!doctype html><html lang="${escapeAttribute(t.locale)}">`,
    `<head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="light dark">`,
    `<meta name="supported-color-schemes" content="light dark">`,
    `<title>${escapeHtml(input.subject)}</title>`,
    `<style>${styleSheet(brand.palette.dark)}</style></head>`,
    `<body class="m-page" style="margin:0;padding:0;background-color:${light.page};${text}">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">`,
    `${escapeHtml(preheader(body))}</div>`,
    `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" `,
    `style="background-color:${light.page}"><tr>`,
    `<td class="m-page-cell" align="center" style="padding:32px 12px;background-color:${light.page}">`,
    `<table role="presentation" class="m-card" width="${CARD_WIDTH}" border="0" cellpadding="0" `,
    `cellspacing="0" style="width:100%;max-width:${CARD_WIDTH}px;background-color:${light.card};`,
    `border:1px solid ${light.border};border-radius:${radius + 4}px;overflow:hidden">`,
    `<tr><td class="m-accent" style="height:4px;line-height:4px;font-size:0;`,
    `background-color:${light.primary}">&nbsp;</td></tr>`,
    `<tr><td class="m-band m-pad" align="left" style="padding:20px 32px;`,
    `background-color:${light.band};border-bottom:1px solid ${light.border}">`,
    `${masthead(brand, boardName, light, headingFont)}</td></tr>`,
    `<tr><td class="m-pad" style="padding:32px">`,
    `<h1 class="m-title" style="margin:0 0 20px;font-family:${headingFont};font-size:21px;`,
    `line-height:1.3;font-weight:700;color:${light.text}">${escapeHtml(body.title)}</h1>`,
  )

  if (typeof body.greeting === 'string' && body.greeting.trim() !== '') {
    parts.push(`<p class="m-text" style="margin:0 0 16px;${text}">`)
    parts.push(`${escapeHtml(body.greeting)}</p>`)
  }

  for (const paragraph of paragraphs(body)) {
    parts.push(
      `<p class="m-text" style="margin:0 0 16px;${text}">`,
      `${escapeHtml(paragraph).replace(/\n/g, `<br>`)}</p>`,
    )
  }

  const action = body.action ?? null
  const actionHref = action === null ? null : safeHref(action.href)

  if (action !== null && actionHref !== null) {
    parts.push(
      `<div style="margin:24px 0 20px">`,
      actionButton(action, actionHref, light, bodyFont, radius),
      `</div>`,
      `<p class="m-muted" style="margin:0;font-size:13px;line-height:1.6;color:${light.muted};`,
      `word-break:break-all">${escapeHtml(t.t('mail.action.fallback'))}<br>`,
      `<a href="${escapeAttribute(actionHref)}" class="m-link" `,
      `style="color:${light.text};text-decoration:underline;`,
      `text-decoration-color:${light.primary}">${escapeHtml(actionHref)}</a></p>`,
    )
  }

  if (typeof body.note === 'string' && body.note.trim() !== '') {
    parts.push(
      `<p class="m-muted" style="margin:20px 0 0;font-size:13px;line-height:1.6;`,
      `color:${light.muted}">${escapeHtml(body.note)}</p>`,
    )
  }

  parts.push(`</td></tr></table>`)

  const footer = footerLines(body)
  if (footer.length > 0) {
    parts.push(
      `<table role="presentation" width="${CARD_WIDTH}" border="0" cellpadding="0" `,
      `cellspacing="0" style="width:100%;max-width:${CARD_WIDTH}px"><tr>`,
      `<td class="m-foot m-pad" align="center" style="padding:20px 32px 0;font-family:${bodyFont};`,
      `font-size:12px;line-height:1.7;color:${light.muted}">`,
    )

    for (const line of footer) {
      const href = safeHref(line.href)
      parts.push(
        `<p style="margin:0">`,
        href === null
          ? escapeHtml(line.text)
          : `<a href="${escapeAttribute(href)}" style="color:${light.muted};` +
              `text-decoration:underline">${escapeHtml(line.text)}</a>`,
        `</p>`,
      )
    }

    parts.push(`</td></tr></table>`)
  }

  parts.push(`</td></tr></table></body></html>`)

  return parts.join('')
}

export function renderMail(input: {
  readonly brand: MailBrand
  readonly body: MailBody
  readonly t: Translator
}): RenderedMail {
  const boardName =
    input.brand.boardName === '' ? input.t.t('mail.boardFallback') : input.brand.boardName

  const subject = `[${boardName}] ${input.body.title}`

  return {
    subject,
    text: renderMailText({ brand: input.brand, body: input.body, boardName }),
    html: renderMailHtml({ ...input, boardName, subject }),
  }
}
