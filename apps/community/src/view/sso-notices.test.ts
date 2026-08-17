import { describe, expect, it } from 'vitest'

import { ssoNotice, ssoOutcomeCode } from './sso-notices'

describe('what a sign-in redirect tells the reader', () => {
  it('says nothing when nothing happened', () => {
    expect(ssoNotice(undefined)).toBeNull()
  })

  it('reports the good outcomes as information', () => {
    expect(ssoNotice('linked')?.kind).toBe('info')
    expect(ssoNotice('unlinked')?.kind).toBe('info')
    expect(ssoNotice('approval')?.kind).toBe('info')
  })

  it('reports the rest as a warning', () => {
    for (const code of ['expired', 'refused', 'off', 'conflict', 'forbidden', 'invalid']) {
      expect(ssoNotice(code)?.kind).toBe('warning')
    }
  })

  it('reads a made-up code as a generic failure rather than echoing it', () => {
    const notice = ssoNotice('<script>alert(1)</script>')
    expect(notice?.message).toBe(ssoNotice('failed')?.message)
    expect(notice?.message).not.toContain('script')
  })
})

describe('turning a refusal into a code', () => {
  it('keeps the shape of the failure without repeating its words', () => {
    expect(ssoOutcomeCode('CONFLICT')).toBe('conflict')
    expect(ssoOutcomeCode('FORBIDDEN')).toBe('forbidden')
    expect(ssoOutcomeCode('VALIDATION')).toBe('invalid')
    expect(ssoOutcomeCode('RATE_LIMITED')).toBe('slowdown')
  })

  it('falls back for anything it does not recognise', () => {
    expect(ssoOutcomeCode('INTERNAL')).toBe('failed')
    expect(ssoOutcomeCode(null)).toBe('failed')
  })
})
