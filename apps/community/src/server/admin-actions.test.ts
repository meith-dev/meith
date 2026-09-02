import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 1,
  prefix: '203.0.113.0/24' as string | null,
  factorEnrolled: false,
  factorOutcome: 'ok' as 'ok' | 'wrong' | 'replayed',
  held: false,
  attempts: new Map<string, Date[]>(),
  cleared: [] as string[],
}))

vi.mock('next/navigation', () => ({
  redirect: (target: string): never => {
    throw new Error(`redirect:${target}`)
  },
}))

vi.mock('@meith/accounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@meith/accounts')>()
  return {
    ...actual,
    verifyPassword: async (password: string) => password === 'right-password',
  }
})

vi.mock('./admin', () => ({
  adminAllowlist: async () => [],
  adminService: () => ({
    start: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
    markReauthenticated: async () => {},
  }),
  recordAdminAction: async () => {},
  resolveAdmin: async () => ({ denied: 'missing' }),
  holdAdminSecondFactor: async () => {
    state.held = true
  },
  pendingAdminSecondFactor: async () =>
    state.held ? { userId: state.userId, next: '/admin' } : null,
  redeemAdminSecondFactor: async () => {
    if (!state.held) return null
    state.held = false
    return { userId: state.userId, next: '/admin' }
  },
  abandonAdminSecondFactor: async () => {
    state.held = false
  },
}))

vi.mock('./auth-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth-config')>()
  return {
    ...actual,
    boardAuthConfig: async () => ({
      ...actual.AUTH_CONFIG,
      maxLoginAttempts: 2,
      lockoutMinutes: 15,
    }),
  }
})

vi.mock('./container', () => ({
  getContainer: () => ({
    authorizer: { can: () => true },
    accountStore: {
      accounts: { findById: async () => ({ passwordHash: 'stored' }) },
      loginAttempts: {
        countFailuresSince: async (bucket: string, since: Date) =>
          (state.attempts.get(bucket) ?? []).filter((at) => at >= since).length,
        record: async (bucket: string, succeeded: boolean, at: Date) => {
          if (!succeeded) state.attempts.set(bucket, [...(state.attempts.get(bucket) ?? []), at])
        },
        clear: async (bucket: string) => {
          state.attempts.delete(bucket)
          state.cleared.push(bucket)
        },
      },
    },
  }),
}))

vi.mock('./context', () => ({
  getActor: async () => ({ userId: state.userId }),
}))

vi.mock('./request-fingerprint', () => ({
  remoteAddress: async () => '203.0.113.7',
  retainedIpPrefix: async () => state.prefix,
}))

vi.mock('./session-cookies', () => ({
  clearAdminCookie: async () => {},
  readAdminToken: async () => null,
  setAdminCookie: async () => {},
}))

vi.mock('./two-factor', () => ({
  twoFactorRequiredForStaff: async () => false,
  twoFactorService: () => ({
    isEnrolled: async () => state.factorEnrolled,
    verify: async () => ({ status: state.factorOutcome }),
  }),
}))

const { adminSignInAction, adminVerifySecondFactorAction } = await import('./admin-actions')
const { EMPTY_STATE } = await import('./auth-form-state')

function form(password: string): FormData {
  const value = new FormData()
  value.set('password', password)
  return value
}

function codeForm(code: string): FormData {
  const value = new FormData()
  value.set('code', code)
  return value
}

beforeEach(() => {
  state.userId = 1
  state.prefix = '203.0.113.0/24'
  state.factorEnrolled = false
  state.factorOutcome = 'ok'
  state.held = false
  state.attempts.clear()
  state.cleared.length = 0
})

describe('admin reauthentication attempts', () => {
  it('blocks password verification after the configured failures', async () => {
    await adminSignInAction(EMPTY_STATE, form('wrong'))
    await adminSignInAction(EMPTY_STATE, form('wrong'))

    const blocked = await adminSignInAction(EMPTY_STATE, form('right-password'))

    expect(blocked.error).toMatch(/too many/i)
  })

  it('counts wrong and replayed second factors in the same bucket', async () => {
    state.factorEnrolled = true
    state.held = true

    state.factorOutcome = 'wrong'
    await adminVerifySecondFactorAction(EMPTY_STATE, codeForm('111111'))
    state.factorOutcome = 'replayed'
    await adminVerifySecondFactorAction(EMPTY_STATE, codeForm('222222'))

    const blocked = await adminVerifySecondFactorAction(EMPTY_STATE, codeForm('333333'))

    expect(blocked.error).toMatch(/too many/i)
  })

  it('isolates attempts by administrator and retained address prefix', async () => {
    await adminSignInAction(EMPTY_STATE, form('wrong'))
    await adminSignInAction(EMPTY_STATE, form('wrong'))

    state.userId = 2
    const otherUser = await adminSignInAction(EMPTY_STATE, form('wrong'))
    state.userId = 1
    state.prefix = '198.51.100.0/24'
    const otherPrefix = await adminSignInAction(EMPTY_STATE, form('wrong'))

    expect(otherUser.error).not.toMatch(/too many/i)
    expect(otherPrefix.error).not.toMatch(/too many/i)
  })

  it('clears failures only after the second factor succeeds', async () => {
    state.factorEnrolled = true
    state.held = true

    state.factorOutcome = 'wrong'
    await adminVerifySecondFactorAction(EMPTY_STATE, codeForm('111111'))
    expect(state.cleared).toHaveLength(0)

    state.factorOutcome = 'ok'
    await expect(adminVerifySecondFactorAction(EMPTY_STATE, codeForm('222222'))).rejects.toThrow(
      'redirect:/admin',
    )

    expect(state.cleared).toEqual(['admin-reauth:1@203.0.113.0/24'])
  })
})

describe('admin sign-in without a second factor', () => {
  it('signs in and clears the attempt bucket when nothing is enrolled', async () => {
    await expect(adminSignInAction(EMPTY_STATE, form('right-password'))).rejects.toThrow(
      'redirect:/admin',
    )

    expect(state.held).toBe(false)
    expect(state.cleared).toEqual(['admin-reauth:1@203.0.113.0/24'])
  })
})

describe('admin sign-in with a second factor enrolled', () => {
  it('holds for the code and sends the administrator to the second screen', async () => {
    state.factorEnrolled = true

    await expect(adminSignInAction(EMPTY_STATE, form('right-password'))).rejects.toThrow(
      'redirect:/admin',
    )

    expect(state.held).toBe(true)
    expect(state.cleared).toHaveLength(0)
  })
})

describe('admin second factor verification', () => {
  it('refuses when there is no pending hold', async () => {
    const result = await adminVerifySecondFactorAction(EMPTY_STATE, codeForm('123456'))

    expect(result.error).toMatch(/again/i)
  })

  it('signs in once the code is right', async () => {
    state.factorEnrolled = true
    state.held = true

    await expect(adminVerifySecondFactorAction(EMPTY_STATE, codeForm('123456'))).rejects.toThrow(
      'redirect:/admin',
    )

    expect(state.held).toBe(false)
  })
})
