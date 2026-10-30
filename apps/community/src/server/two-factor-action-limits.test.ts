import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  hasPassword: true,
  limit: vi.fn(async () => ({ allowed: false, used: 21, retryAfterSeconds: 60 })),
  confirm: vi.fn(),
  verify: vi.fn(),
  replace: vi.fn(),
  disable: vi.fn(),
}))

vi.mock('./antispam', () => ({
  spendCredentialProofLimit: state.limit,
  refused: () => true,
  limitMessage: () => 'Too many attempts.',
}))
vi.mock('./context', () => ({ getActor: async () => ({ userId: 42 }) }))
vi.mock('./container', () => ({
  getContainer: () => ({
    accountStore: {
      accounts: {
        findById: async () => ({ passwordHash: state.hasPassword ? 'hash' : null }),
      },
    },
  }),
}))
vi.mock('./credential-proof', () => ({ requireFreshCredentialProof: async () => undefined }))
vi.mock('./two-factor', () => ({
  twoFactorOffered: async () => true,
  twoFactorService: () => ({
    confirmEnrolment: state.confirm,
    verify: state.verify,
    replaceRecoveryCodes: state.replace,
    disable: state.disable,
  }),
}))

const { confirmTwoFactorAction, replaceRecoveryCodesAction, disableTwoFactorAction } = await import(
  './two-factor-actions'
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('two-factor mutation rate limits', () => {
  it.each([
    ['confirm', confirmTwoFactorAction],
    ['replace', replaceRecoveryCodesAction],
    ['disable', disableTwoFactorAction],
  ] as const)(
    'limits %s for password and SSO accounts before checking credentials',
    async (_name, action) => {
      for (const hasPassword of [true, false]) {
        state.hasPassword = hasPassword
        expect(await action({}, new FormData())).toEqual({ error: 'Too many attempts.' })
        expect(state.limit).toHaveBeenLastCalledWith(42)
      }
      expect(state.confirm).not.toHaveBeenCalled()
      expect(state.verify).not.toHaveBeenCalled()
      expect(state.replace).not.toHaveBeenCalled()
      expect(state.disable).not.toHaveBeenCalled()
    },
  )
})
