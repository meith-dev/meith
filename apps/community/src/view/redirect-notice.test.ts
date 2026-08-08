import { describe, expect, it } from 'vitest'

import { buildRedirectNotice, REDIRECT_DELAY_SECONDS } from './redirect-notice'

describe('buildRedirectNotice', () => {
  it('keeps redirects on this board and supplies a useful fallback', () => {
    expect(buildRedirectNotice('/community/200-general?after=x#new', 'Posted')).toEqual({
      targetHref: '/community/200-general?after=x#new',
      message: 'Posted',
      delaySeconds: REDIRECT_DELAY_SECONDS,
    })
    expect(buildRedirectNotice('//evil.example', '  ')).toMatchObject({
      targetHref: '/',
      message: 'Continuing…',
    })
  })
})
