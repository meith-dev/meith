import { describe, expect, it } from 'vitest'

import { escapeHtml, handOffPage } from './sso-hand-off'
import { untranslated } from './time'

const t = untranslated()

describe('the page that hands a member to their provider', () => {
  it('refreshes to the authorization address and offers it as a link too', () => {
    const html = handOffPage({
      label: 'GitHub',
      authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=abc&state=xyz',
      t,
    })

    expect(html).toContain(
      '<meta http-equiv="refresh" content="0; url=https://github.com/login/oauth/authorize?client_id=abc&amp;state=xyz">',
    )
    expect(html).toContain(
      '<a href="https://github.com/login/oauth/authorize?client_id=abc&amp;state=xyz">Continue to GitHub</a>',
    )
  })

  it('keeps search engines out of a page that only exists mid-handshake', () => {
    expect(handOffPage({ label: 'GitHub', authorizationUrl: 'https://github.com', t })).toContain(
      '<meta name="robots" content="noindex, nofollow">',
    )
  })

  it('escapes a label an operator wrote, so a name cannot become markup', () => {
    const html = handOffPage({
      label: '<img src=x onerror=alert(1)>',
      authorizationUrl: 'https://login.example.com/authorize',
      t,
    })

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('escapes an address, so a query string cannot close the attribute', () => {
    const html = handOffPage({
      label: 'Acme',
      t,
      authorizationUrl: 'https://login.example.com/authorize?x="><script>alert(1)</script>',
    })

    expect(html).not.toContain('<script>')
  })

  it('escapes the characters that matter and leaves the rest alone', () => {
    expect(escapeHtml(`<&>"'x`)).toBe('&lt;&amp;&gt;&quot;&#39;x')
  })
})
