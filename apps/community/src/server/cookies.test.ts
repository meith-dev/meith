import { describe, expect, it } from 'vitest'

import {
  DEV_REMEMBER_COOKIE,
  DEV_SESSION_COOKIE,
  REMEMBER_COOKIE,
  rememberCookieName,
  SESSION_COOKIE,
  sessionCookieName,
} from './cookies'

describe('cookie names', () => {
  it('uses __Host- names only when Secure is available', () => {
    expect(sessionCookieName(true)).toBe(SESSION_COOKIE)
    expect(rememberCookieName(true)).toBe(REMEMBER_COOKIE)
    expect(sessionCookieName(false)).toBe(DEV_SESSION_COOKIE)
    expect(rememberCookieName(false)).toBe(DEV_REMEMBER_COOKIE)
  })
})
