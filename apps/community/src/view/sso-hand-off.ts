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
}): string {
  const label = escapeHtml(input.label)
  const target = escapeHtml(input.authorizationUrl)

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    `<meta http-equiv="refresh" content="0; url=${target}">`,
    `<title>Continuing to ${label}</title>`,
    '<style>',
    ':root{color-scheme:light dark}',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;',
    'font-family:system-ui,sans-serif;padding:2rem;text-align:center}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    `<p>Sending you to ${label} to sign in.</p>`,
    `<p><a href="${target}">Continue to ${label}</a></p>`,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
