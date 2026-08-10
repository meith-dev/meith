import { describe, expect, it } from 'vitest'

import { DEMO_LOGINS } from './accounts'
import { demoBanner } from './banner'

const NOW = new Date('2026-08-10T09:00:00Z')

describe('the demo banner', () => {
  it('prints every published login, password included', () => {
    const banner = demoBanner({ nextResetAt: null, now: NOW })

    expect(banner.logins).toEqual(
      Object.values(DEMO_LOGINS).map((login) => ({
        username: login.username,
        password: login.password,
      })),
    )
  })

  it('says nothing about a reset it cannot date', () => {
    expect(demoBanner({ nextResetAt: null, now: NOW }).resetsIn).toBeNull()
  })

  it('counts down in the units a visitor thinks in', () => {
    const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

    expect(demoBanner({ nextResetAt: at(34), now: NOW }).resetsIn).toBe('in 34 minutes')
    expect(demoBanner({ nextResetAt: at(1), now: NOW }).resetsIn).toBe('in a minute')
    expect(demoBanner({ nextResetAt: at(60), now: NOW }).resetsIn).toBe('in an hour')
    expect(demoBanner({ nextResetAt: at(180), now: NOW }).resetsIn).toBe('in 3 hours')
  })

  it('does not promise a reset in the past when one is overdue', () => {
    const overdue = new Date(NOW.getTime() - 5 * 60_000)
    expect(demoBanner({ nextResetAt: overdue, now: NOW }).resetsIn).toBe('in a moment')
  })
})
