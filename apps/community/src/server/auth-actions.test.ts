import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from '@meith/core'

import type * as AntispamModule from './antispam'
import type * as AuthConfigModule from './auth-config'

const { jar, RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(readonly location: string) {
      super(`redirect: ${location}`)
    }
  }
  return { jar: new Map<string, string>(), RedirectError }
})

vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '203.0.113.7']]),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value)
    },
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new RedirectError(to)
  },
}))

const mail = vi.hoisted(() => ({
  verifications: [] as Array<{ token: string; email: string; username: string }>,
  resets: [] as Array<{ token: string; email: string; username: string }>,
  failVerification: false,
  failReset: false,
}))

vi.mock('./auth-mail', () => ({
  sendVerificationEmail: async (input: { token: string; email: string; username: string }) => {
    if (mail.failVerification) throw new Error('provider is down')
    mail.verifications.push(input)
  },
  sendPasswordResetEmail: async (input: { token: string; email: string; username: string }) => {
    if (mail.failReset) throw new Error('provider is down')
    mail.resets.push(input)
  },
}))

const policy = vi.hoisted(() => ({
  activationMethod: 'none' as string,
  registrationEnabled: true,
  overrides: {} as Record<string, number>,
}))

const limiter = vi.hoisted(() => ({
  refuse: false,
  refuseRegistration: false,
  registrationsSpent: 0,
  refuseReset: null as null | 'email' | 'address',
  loginAddressAttempts: 0,
  resetSubjects: [] as string[],
}))

const REFUSED = { allowed: false as const, used: 99, retryAfterSeconds: 600 }

vi.mock('./antispam', async (importOriginal) => {
  const actual = await importOriginal<typeof AntispamModule>()
  return {
    ...actual,
    spendResendLimit: async () => (limiter.refuse ? REFUSED : null),
    spendRegisterLimit: async () => {
      limiter.registrationsSpent += 1
      return limiter.refuseRegistration ? REFUSED : null
    },
    spendResetLimits: async (emailLower: string) => {
      limiter.resetSubjects.push(emailLower)
      return [
        limiter.refuseReset === 'email' ? REFUSED : null,
        limiter.refuseReset === 'address' ? REFUSED : null,
      ]
    },
    loginAddressAttempts: async () => limiter.loginAddressAttempts,
  }
})

const legal = vi.hoisted(() => ({ terms: 'Be nice to each other.' }))

vi.mock('./legal', () => ({
  termsAcceptance: async () =>
    legal.terms.trim() === '' ? null : { label: 'Terms of service', href: '/terms' },
}))

vi.mock('./auth-config', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthConfigModule>()
  return {
    ...actual,
    boardAuthConfig: async () => ({
      ...actual.AUTH_CONFIG,
      activationMethod: policy.activationMethod,
      registrationEnabled: policy.registrationEnabled,
      ...policy.overrides,
    }),
  }
})

const {
  confirmResetAction,
  loginAction,
  registerAction,
  requestResetAction,
  resendVerificationAction,
} = await import('./auth-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SESSION_COOKIE } = await import('./cookies')
const { getContainer } = await import('./container')

const CONTAINER_KEY = Symbol.for('@meith/forum.container')

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

async function inDevelopment<T>(body: () => Promise<T>): Promise<T> {
  vi.stubEnv('NODE_ENV', 'development')
  resetEnvForTests()
  try {
    return await body()
  } finally {
    vi.unstubAllEnvs()
    resetEnvForTests()
  }
}

async function redirectOf(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (err) {
    if (err instanceof RedirectError) return err.location
    throw err
  }
  throw new Error('expected the action to redirect, but it returned')
}

const CREDS = {
  username: 'ivan',
  email: 'ivan@example.com',
  password: 'correct-horse',
  terms: '1',
}

async function registerUser(over: Partial<typeof CREDS> = {}): Promise<void> {
  await redirectOf(registerAction(EMPTY_STATE, form({ ...CREDS, ...over })))
}

beforeEach(() => {
  jar.clear()
  delete (globalThis as Record<symbol, unknown>)[CONTAINER_KEY]
  mail.verifications.length = 0
  mail.resets.length = 0
  mail.failVerification = false
  mail.failReset = false
  policy.activationMethod = 'none'
  policy.registrationEnabled = true
  policy.overrides = {}
  limiter.refuse = false
  limiter.refuseRegistration = false
  limiter.registrationsSpent = 0
  limiter.refuseReset = null
  limiter.loginAddressAttempts = 0
  limiter.resetSubjects.length = 0
  legal.terms = 'Be nice to each other.'
})

describe('registerAction', () => {
  it('creates the account and sends the user to login', async () => {
    expect(await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))).toBe('/login?registered=1')
  })

  it('refuses a form POSTed straight at it while registration is closed', async () => {
    policy.registrationEnabled = false

    const state = await registerAction(EMPTY_STATE, form(CREDS))

    expect(state.error).toMatch(/not taking new members/i)

    policy.registrationEnabled = true
    expect(await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))).toBe('/login?registered=1')
  })

  it('rejects a duplicate username differing only by case', async () => {
    await registerUser()

    const state = await registerAction(
      EMPTY_STATE,
      form({ ...CREDS, username: 'IVAN', email: 'other@example.com' }),
    )
    expect(state.error).toBeTruthy()
  })

  it('echoes back what was typed, but never the password', async () => {
    const state = await registerAction(EMPTY_STATE, form({ ...CREDS, username: 'x' }))
    expect(state.error).toBeTruthy()
    expect(JSON.stringify(state)).not.toContain(CREDS.password)
  })

  it('refuses an account when the terms were not accepted', async () => {
    const state = await registerAction(EMPTY_STATE, form({ ...CREDS, terms: '' }))

    expect(state.error).toContain('Terms of service')
    expect(state.values?.terms).toBeUndefined()
  })

  it('spends no allowance on a form a person simply got wrong', async () => {
    await registerAction(EMPTY_STATE, form({ ...CREDS, terms: '' }))

    expect(limiter.registrationsSpent).toBe(0)
  })

  it('refuses an account when the address has registered too often', async () => {
    limiter.refuseRegistration = true

    const state = await registerAction(EMPTY_STATE, form(CREDS))

    expect(state.error).toMatch(/too many times/i)
    expect(state.values?.username).toBe(CREDS.username)
  })

  it('does not spend the limit and then create the account anyway', async () => {
    limiter.refuseRegistration = true
    await registerAction(EMPTY_STATE, form(CREDS))

    limiter.refuseRegistration = false
    expect(await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))).toBe('/login?registered=1')
  })

  it('creates the account when the board publishes no terms', async () => {
    legal.terms = ''

    expect(await redirectOf(registerAction(EMPTY_STATE, form({ ...CREDS, terms: '' })))).toBe(
      '/login?registered=1',
    )
  })
})

describe('loginAction', () => {
  it('sets a session cookie and follows ?next', async () => {
    await registerUser()

    const to = await redirectOf(
      loginAction(
        EMPTY_STATE,
        form({ identifier: CREDS.username, password: CREDS.password, next: '/settings' }),
      ),
    )
    expect(to).toBe('/settings')
    expect(jar.get(SESSION_COOKIE)).toBeTruthy()
  })

  it('accepts the account regardless of the case typed', async () => {
    await registerUser()
    await redirectOf(
      loginAction(EMPTY_STATE, form({ identifier: 'IVAN', password: CREDS.password })),
    )
    expect(jar.get(SESSION_COOKIE)).toBeTruthy()
  })

  it('issues a different session id than the one presented (fixation)', async () => {
    await registerUser()
    jar.set(SESSION_COOKIE, 'attacker-fixed-session-value')

    await redirectOf(
      loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: CREDS.password })),
    )
    expect(jar.get(SESSION_COOKIE)).not.toBe('attacker-fixed-session-value')
  })

  it('refuses an off-site ?next (open redirect)', async () => {
    await registerUser()

    const to = await redirectOf(
      loginAction(
        EMPTY_STATE,
        form({
          identifier: CREDS.username,
          password: CREDS.password,
          next: 'https://evil.example/pwned',
        }),
      ),
    )
    expect(to).toBe('/')
  })

  it('refuses a protocol-relative ?next, which is off-site too', async () => {
    await registerUser()

    const to = await redirectOf(
      loginAction(
        EMPTY_STATE,
        form({ identifier: CREDS.username, password: CREDS.password, next: '//evil.example' }),
      ),
    )
    expect(to).toBe('/')
  })

  it('sets no cookie on a bad password', async () => {
    await registerUser()

    const state = await loginAction(
      EMPTY_STATE,
      form({ identifier: CREDS.username, password: 'wrong-password' }),
    )
    expect(state.error).toBeTruthy()
    expect(jar.has(SESSION_COOKIE)).toBe(false)
  })

  it('locks out at the number the settings screen says, not at the constant', async () => {
    await registerUser()
    policy.overrides = { maxLoginAttempts: 2 }

    for (let i = 0; i < 2; i++) {
      const state = await loginAction(
        EMPTY_STATE,
        form({ identifier: CREDS.username, password: 'wrong-password' }),
      )
      expect(state.error).toMatch(/incorrect/i)
    }

    const blocked = await loginAction(
      EMPTY_STATE,
      form({ identifier: CREDS.username, password: CREDS.password }),
    )
    expect(blocked.error).toMatch(/too many/i)
    expect(jar.has(SESSION_COOKIE)).toBe(false)
  })

  it('lets a board switch the lockout off entirely', async () => {
    await registerUser()
    policy.overrides = { maxLoginAttempts: 0, maxAccountLoginAttempts: 0 }

    for (let i = 0; i < 8; i++) {
      await loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: 'nope' }))
    }

    await redirectOf(
      loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: CREDS.password })),
    )
    expect(jar.get(SESSION_COOKIE)).toBeTruthy()
  })

  it('takes the account-wide backstop from the settings screen too', async () => {
    await registerUser()
    policy.overrides = { maxLoginAttempts: 0, maxAccountLoginAttempts: 2 }

    for (let i = 0; i < 2; i++) {
      await loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: 'nope' }))
    }

    const blocked = await loginAction(
      EMPTY_STATE,
      form({ identifier: CREDS.username, password: CREDS.password }),
    )
    expect(blocked.error).toMatch(/too many/i)
  })

  it('stops a spray of single guesses at unrelated accounts from one address', async () => {
    await registerUser()
    limiter.loginAddressAttempts = 2

    for (const identifier of ['nobody', 'somebody']) {
      const state = await loginAction(EMPTY_STATE, form({ identifier, password: 'guess' }))
      expect(state.error).toMatch(/incorrect/i)
    }

    const blocked = await loginAction(
      EMPTY_STATE,
      form({ identifier: CREDS.username, password: CREDS.password }),
    )
    expect(blocked.error).toMatch(/too many/i)
    expect(jar.has(SESSION_COOKIE)).toBe(false)
  })

  it('leaves the spray bucket out when the board has turned it off', async () => {
    await registerUser()
    limiter.loginAddressAttempts = 0

    for (const identifier of ['nobody', 'somebody', 'anybody']) {
      await loginAction(EMPTY_STATE, form({ identifier, password: 'guess' }))
    }

    await redirectOf(
      loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: CREDS.password })),
    )
    expect(jar.get(SESSION_COOKIE)).toBeTruthy()
  })

  it('locks the account out after the configured number of failures', async () => {
    await registerUser()

    for (let i = 0; i < 5; i++) {
      await loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: `bad-${i}` }))
    }

    const state = await loginAction(
      EMPTY_STATE,
      form({ identifier: CREDS.username, password: CREDS.password }),
    )
    expect(state.error).toBeTruthy()
    expect(jar.has(SESSION_COOKIE)).toBe(false)
  })
})

describe('the address range an account is recorded against', () => {
  const ADDRESS = '203.0.113.7'
  const RANGE = '203.0.113.0/24'

  it('stores the range a registration came from, never the address', async () => {
    const create = vi.spyOn(getContainer().accountStore.accounts, 'create')

    await registerUser()

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ registrationIpPrefix: RANGE }))
    expect(JSON.stringify(create.mock.calls)).not.toContain(ADDRESS)
  })

  it('records the range a sign-in came from, never the address', async () => {
    await registerUser()
    const record = vi.spyOn(getContainer().accountStore.accounts, 'recordLastIpPrefix')

    await redirectOf(
      loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: CREDS.password })),
    )

    expect(record).toHaveBeenCalledWith(expect.any(Number), RANGE)
    expect(JSON.stringify(record.mock.calls)).not.toContain(ADDRESS)
  })

  it('records nothing when a sign-in is refused', async () => {
    await registerUser()
    const record = vi.spyOn(getContainer().accountStore.accounts, 'recordLastIpPrefix')

    await loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: 'wrong' }))

    expect(record).not.toHaveBeenCalled()
  })
})

describe('password reset', () => {
  it('gives the same answer for a known and an unknown address', async () => {
    await registerUser()

    const known = await requestResetAction(EMPTY_STATE, form({ email: CREDS.email }))
    const unknown = await requestResetAction(EMPTY_STATE, form({ email: 'nobody@example.com' }))
    expect(known.notice).toBe(unknown.notice)
    expect(known.error).toBeUndefined()
  })

  it('never returns the reset token outside development', async () => {
    await registerUser()

    const state = await requestResetAction(EMPTY_STATE, form({ email: CREDS.email }))
    expect(state.values?.devToken).toBeUndefined()
    expect(state.notice).toBeTruthy()
  })

  it('returns the token in development, where there is no mailer', async () => {
    await registerUser()

    const state = await inDevelopment(() =>
      requestResetAction(EMPTY_STATE, form({ email: CREDS.email })),
    )
    expect(state.values?.devToken).toBeTruthy()
  })

  it('cannot be replayed once redeemed', async () => {
    await registerUser()

    const requested = await inDevelopment(() =>
      requestResetAction(EMPTY_STATE, form({ email: CREDS.email })),
    )
    const token = requested.values?.devToken as string
    expect(token).toBeTruthy()

    const next = 'a-brand-new-password'
    expect(
      await redirectOf(
        confirmResetAction(EMPTY_STATE, form({ token, password: next, confirm: next })),
      ),
    ).toBe('/login?reset=1')

    const replay = await confirmResetAction(
      EMPTY_STATE,
      form({ token, password: 'attacker-chosen', confirm: 'attacker-chosen' }),
    )
    expect(replay.error).toBeTruthy()

    await redirectOf(loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: next })))
    expect(jar.get(SESSION_COOKIE)).toBeTruthy()
  })

  it('rejects a mismatched confirmation without consuming the token', async () => {
    const state = await confirmResetAction(
      EMPTY_STATE,
      form({ token: 'irrelevant', password: 'aaaaaaaa', confirm: 'bbbbbbbb' }),
    )
    expect(state.error).toMatch(/do not match/i)
  })

  it('mails the reset link to the address on the account', async () => {
    await registerUser()

    await requestResetAction(EMPTY_STATE, form({ email: CREDS.email }))

    expect(mail.resets).toHaveLength(1)
    expect(mail.resets[0]?.email).toBe(CREDS.email)
    expect(mail.resets[0]?.username).toBe(CREDS.username)
    expect(mail.resets[0]?.token).toBeTruthy()
  })

  it('sends nothing for an address with no account', async () => {
    await registerUser()

    await requestResetAction(EMPTY_STATE, form({ email: 'nobody@example.com' }))
    expect(mail.resets).toEqual([])
  })

  it('sends nothing once the address has asked too often, and says so no differently', async () => {
    await registerUser()
    const allowed = await requestResetAction(EMPTY_STATE, form({ email: CREDS.email }))
    mail.resets.length = 0

    limiter.refuseReset = 'email'
    const limited = await requestResetAction(EMPTY_STATE, form({ email: CREDS.email }))

    expect(mail.resets).toEqual([])
    expect(limited).toEqual(allowed)
  })

  it('stops a caller working through a list of addresses from one place', async () => {
    await registerUser()
    limiter.refuseReset = 'address'

    const state = await requestResetAction(EMPTY_STATE, form({ email: CREDS.email }))

    expect(mail.resets).toEqual([])
    expect(state.notice).toBeTruthy()
    expect(state.error).toBeUndefined()
  })

  it('counts the request against the folded address, so case cannot buy more', async () => {
    await requestResetAction(EMPTY_STATE, form({ email: 'Ivan@Example.com' }))

    expect(limiter.resetSubjects).toEqual(['ivan@example.com'])
  })

  it('gives the same answer when the send fails', async () => {
    await registerUser()
    mail.failReset = true

    const state = await requestResetAction(EMPTY_STATE, form({ email: CREDS.email }))

    expect(state.error).toBeUndefined()
    expect(state.notice).toBeTruthy()
  })
})

describe('registration with e-mail activation', () => {
  beforeEach(() => {
    policy.activationMethod = 'email'
  })

  it('sends the link and lands on the screen that can resend it', async () => {
    const to = await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))

    expect(to).toBe(`/verify/resend?email=${encodeURIComponent(CREDS.email)}&sent=1`)
    expect(mail.verifications).toHaveLength(1)
    expect(mail.verifications[0]?.email).toBe(CREDS.email)
    expect(mail.verifications[0]?.token).toBeTruthy()
  })

  it('a failed send does not fail the registration, and the account survives', async () => {
    mail.failVerification = true

    const to = await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    expect(to).toBe(`/verify/resend?email=${encodeURIComponent(CREDS.email)}&sent=1`)

    const again = await registerAction(EMPTY_STATE, form(CREDS))
    expect(again.error).toBeTruthy()
  })

  it('does not sign the new account in', async () => {
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    expect(jar.has(SESSION_COOKIE)).toBe(false)

    const state = await loginAction(
      EMPTY_STATE,
      form({ identifier: CREDS.username, password: CREDS.password }),
    )
    expect(state.error).toMatch(/not yet activated/i)
  })

  it('honours the configured method rather than the static default', async () => {
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    expect(mail.verifications).toHaveLength(1)

    policy.activationMethod = 'none'

    const to = await redirectOf(
      registerAction(EMPTY_STATE, form({ ...CREDS, username: 'nora', email: 'nora@example.com' })),
    )
    expect(to).toBe('/login?registered=1')
    expect(mail.verifications).toHaveLength(1)
  })
})

describe('resending a verification link', () => {
  beforeEach(() => {
    policy.activationMethod = 'email'
  })

  it('sends another link for an account still waiting', async () => {
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    mail.verifications.length = 0

    const state = await resendVerificationAction(EMPTY_STATE, form({ email: CREDS.email }))

    expect(state.notice).toBeTruthy()
    expect(state.error).toBeUndefined()
    expect(mail.verifications).toHaveLength(1)
  })

  it('gives the same answer for an address nobody has', async () => {
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    mail.verifications.length = 0

    const known = await resendVerificationAction(EMPTY_STATE, form({ email: CREDS.email }))
    const unknown = await resendVerificationAction(
      EMPTY_STATE,
      form({ email: 'nobody@example.com' }),
    )

    expect(known.notice).toBe(unknown.notice)
    expect(mail.verifications).toHaveLength(1)
  })

  it('sends nothing for an account that is already active', async () => {
    policy.activationMethod = 'none'
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    policy.activationMethod = 'email'
    mail.verifications.length = 0

    const state = await resendVerificationAction(EMPTY_STATE, form({ email: CREDS.email }))

    expect(state.notice).toBeTruthy()
    expect(mail.verifications).toEqual([])
  })

  it('a refused rate limit is indistinguishable from a successful send', async () => {
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    mail.verifications.length = 0

    const allowed = await resendVerificationAction(EMPTY_STATE, form({ email: CREDS.email }))
    limiter.refuse = true
    const refused = await resendVerificationAction(EMPTY_STATE, form({ email: CREDS.email }))

    expect(refused.notice).toBe(allowed.notice)
    expect(refused.error).toBeUndefined()
    expect(mail.verifications).toHaveLength(1)
  })

  it('never returns the token to the browser, in development or out of it', async () => {
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))

    const state = await inDevelopment(() =>
      resendVerificationAction(EMPTY_STATE, form({ email: CREDS.email })),
    )
    expect(JSON.stringify(state)).not.toContain('token')
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
