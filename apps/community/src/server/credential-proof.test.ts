import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enrolled: true,
  owner: 42,
  mark: vi.fn(async () => true),
}))

vi.mock('./session-cookies', () => ({ readSessionToken: async () => 'token' }))
vi.mock('./container', () => ({
  getContainer: () => ({
    accountStore: {
      twoFactor: { find: async () => (state.enrolled ? { confirmedAt: new Date() } : null) },
      sessions: {
        findByTokenHash: async () => ({ id: 1, userId: state.owner }),
        markCredentialProved: state.mark,
      },
    },
  }),
}))

const { markCurrentSessionCredentialProved } = await import('./credential-proof')

beforeEach(() => {
  state.enrolled = true
  state.owner = 42
  vi.clearAllMocks()
})

describe('fresh credential proof strength', () => {
  it.each(['password', 'provider'] as const)(
    'denies %s alone when a second factor is enrolled',
    async (method) => {
      expect(await markCurrentSessionCredentialProved(42, method)).toBe(false)
      expect(state.mark).not.toHaveBeenCalled()
    },
  )

  it.each(['code', 'passkey'] as const)(
    'accepts verified %s proof for an enrolled account',
    async (method) => {
      expect(await markCurrentSessionCredentialProved(42, method)).toBe(true)
      expect(state.mark).toHaveBeenCalledWith(1, 42, expect.any(Date))
    },
  )

  it.each(['password', 'provider'] as const)(
    'preserves %s proof for unenrolled accounts',
    async (method) => {
      state.enrolled = false
      expect(await markCurrentSessionCredentialProved(42, method)).toBe(true)
    },
  )

  it('never proves a different session owner', async () => {
    state.owner = 43
    expect(await markCurrentSessionCredentialProved(42, 'passkey')).toBe(false)
    expect(state.mark).not.toHaveBeenCalled()
  })
})
