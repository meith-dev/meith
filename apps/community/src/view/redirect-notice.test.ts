import { describe, expect, it } from 'vitest'

import { buildRedirectNotice, REDIRECT_DELAY_SECONDS } from './redirect-notice'

describe('buildRedirectNotice', () => {
  it('keeps redirects on this board and supplies a useful fallback', () => {
    expect(buildRedirectNotice('/200-general?after=x#new', 'posted')).toEqual({
      targetHref: '/200-general?after=x#new',
      message: 'Posted.',
      delaySeconds: REDIRECT_DELAY_SECONDS,
    })
    expect(buildRedirectNotice('//evil.example', undefined)).toMatchObject({
      targetHref: '/',
      message: 'Continuing…',
    })
  })

  it('ignores a message key it does not recognise, rather than echoing it', () => {
    expect(buildRedirectNotice('/stats', 'Off you go')).toMatchObject({
      message: 'Continuing…',
    })
    expect(buildRedirectNotice('/stats', '<img src=x onerror=alert(1)>')).toMatchObject({
      message: 'Continuing…',
    })
  })
})
