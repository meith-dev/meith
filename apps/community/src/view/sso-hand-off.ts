import { localeDirection, type Translator } from '@meith/i18n'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function handOffPage(input: {
  readonly label: string
  readonly authorizationUrl: string
  readonly t: Translator
}): string {
  const label = input.label
  const target = escapeHtml(input.authorizationUrl)

  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(input.t.locale)}" dir="${localeDirection(input.t.locale)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    `<meta http-equiv="refresh" content="0; url=${target}">`,
    `<title>${escapeHtml(input.t.t('authSsoHandOff.title', { provider: label }))}</title>`,
    '<style>',
    ':root{color-scheme:light dark}',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;',
    'font-family:system-ui,sans-serif;padding:2rem;text-align:center}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    `<p>${escapeHtml(input.t.t('authSsoHandOff.message', { provider: label }))}</p>`,
    `<p><a href="${target}">${escapeHtml(input.t.t('authSsoHandOff.continue', { provider: label }))}</a></p>`,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
