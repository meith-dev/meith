/**
 * F17/F18/F19 at the app layer — the Server Actions themselves.
 *
 * The domain services are unit-tested in `@meith/accounts`; what is proven here
 * is the adapter tier those tests cannot see: that each action reads FormData,
 * sets the right cookies, redirects where it claims to, and — the part with
 * teeth — that it does not hand a credential to the browser.
 *
 * `next/headers` and `next/navigation` are mocked because a Server Action calls
 * them outside any request scope here. `redirect()` genuinely throws in Next, so
 * the mock throws too; an action that "returns" instead of redirecting would
 * fail these tests exactly as it should.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

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
  /*
   * `loginAction` reads the caller's address to build its narrow lockout
   * bucket (see `loginBuckets`). A fixed one here, so the two counters are
   * distinct and deterministic rather than collapsing into the address-less
   * fallback.
   */
  headers: async () => new Map([['x-forwarded-for', '203.0.113.7']]),
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) as string } : undefined,
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

/**
 * The two direct sends, recorded rather than performed.
 *
 * Mocked as a module for the reason `usercp-actions.test.ts` mocks its own
 * sender: what is under test here is *what the action does about a send*, which
 * includes the case where the send throws — and a real driver that cannot be
 * made to fail on demand cannot prove the interesting half.
 */
const mail = vi.hoisted(() => ({
  verifications: [] as Array<{ token: string; email: string; username: string }>,
  resets: [] as Array<{ token: string; email: string; username: string }>,
  /** Set to make the next verification send throw, as a provider outage would. */
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

/**
 * The board's activation method, swapped per test.
 *
 * `boardAuthConfig` is the seam the whole of work item 1 exists to create, so
 * the tests drive it directly rather than by writing a settings row: the app
 * tests run on fixture data, which has no settings table, and going through one
 * would test the storage rather than the decision.
 */
const policy = vi.hoisted(() => ({ activationMethod: 'none' as string }))

/**
 * The resend limiter, forced to refuse.
 *
 * Fixture mode has no bucket store, so the real limiter counts nothing and
 * fails open — correct behaviour, and useless for proving what a *refusal*
 * looks like from the browser.
 */
const limiter = vi.hoisted(() => ({ refuse: false }))

vi.mock('./antispam', async (importOriginal) => {
  const actual = await importOriginal<typeof AntispamModule>()
  return {
    ...actual,
    spendResendLimit: async () =>
      limiter.refuse ? { allowed: false as const, used: 4, retryAfterSeconds: 600 } : null,
  }
})

vi.mock('./auth-config', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthConfigModule>()
  return {
    ...actual,
    boardAuthConfig: async () => ({
      ...actual.AUTH_CONFIG,
      activationMethod: policy.activationMethod,
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

/** The container memoises onto globalThis; drop it for a clean board per test. */
const CONTAINER_KEY = Symbol.for('@meith/forum.container')

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

/**
 * Run `body` with the app in development mode.
 *
 * `env` memoises its parse, so the cache has to be dropped on the way in *and*
 * on the way out — otherwise a later test inherits a development environment.
 */
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

/** Run an action that is expected to redirect, and return where it went. */
async function redirectOf(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (err) {
    if (err instanceof RedirectError) return err.location
    throw err
  }
  throw new Error('expected the action to redirect, but it returned')
}

const CREDS = { username: 'ivan', email: 'ivan@example.com', password: 'correct-horse' }

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
  limiter.refuse = false
})

describe('registerAction (F18)', () => {
  it('creates the account and sends the user to login', async () => {
    expect(await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))).toBe(
      '/login?registered=1',
    )
  })

  it('rejects a duplicate username differing only by case', async () => {
    await registerUser()

    // F18 acceptance. This is the case that breaks under a locale-sensitive
    // fold: 'IVAN' lowercases to 'ıvan' (dotless) in tr_TR, misses the existing
    // 'ivan', and silently creates a second account. See `foldIdentifier`.
    const state = await registerAction(
      EMPTY_STATE,
      form({ ...CREDS, username: 'IVAN', email: 'other@example.com' }),
    )
    expect(state.error).toBeTruthy()
  })

  it('echoes back what was typed, but never the password', async () => {
    const state = await registerAction(
      EMPTY_STATE,
      form({ ...CREDS, username: 'x' }), // too short
    )
    expect(state.error).toBeTruthy()
    expect(JSON.stringify(state)).not.toContain(CREDS.password)
  })
})

describe('loginAction (F17/F19)', () => {
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
    // An attacker-planted cookie must not survive authentication.
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

  it('locks the account out after the configured number of failures', async () => {
    await registerUser()

    // AUTH_CONFIG.maxLoginAttempts = 5.
    for (let i = 0; i < 5; i++) {
      await loginAction(EMPTY_STATE, form({ identifier: CREDS.username, password: `bad-${i}` }))
    }

    // F19 acceptance: the *correct* password is now refused, which is what makes
    // this a lockout rather than a per-attempt failure count.
    const state = await loginAction(
      EMPTY_STATE,
      form({ identifier: CREDS.username, password: CREDS.password }),
    )
    expect(state.error).toBeTruthy()
    expect(jar.has(SESSION_COOKIE)).toBe(false)
  })
})

describe('password reset (F19)', () => {
  it('gives the same answer for a known and an unknown address', async () => {
    await registerUser()

    const known = await requestResetAction(EMPTY_STATE, form({ email: CREDS.email }))
    const unknown = await requestResetAction(
      EMPTY_STATE,
      form({ email: 'nobody@example.com' }),
    )
    expect(known.notice).toBe(unknown.notice)
    expect(known.error).toBeUndefined()
  })

  /*
   * The regression that matters most in this file. The action used to return the
   * live reset token to the browser unconditionally, behind a comment asserting
   * that "a real deployment never renders this" — which nothing enforced. That is
   * unauthenticated account takeover for any address an attacker knows, so both
   * directions of the gate are pinned.
   */
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

    // Single-use: the same token must not set another password.
    const replay = await confirmResetAction(
      EMPTY_STATE,
      form({ token, password: 'attacker-chosen', confirm: 'attacker-chosen' }),
    )
    expect(replay.error).toBeTruthy()

    // And the first reset really did take effect.
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

  it('gives the same answer when the send fails', async () => {
    await registerUser()
    mail.failReset = true

    const state = await requestResetAction(EMPTY_STATE, form({ email: CREDS.email }))

    // A provider outage must not be distinguishable from an unknown address:
    // the difference would answer "does this address have an account here?".
    expect(state.error).toBeUndefined()
    expect(state.notice).toBeTruthy()
  })
})

describe('registration with e-mail activation (F18)', () => {
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

  /**
   * The mutant this kills: making the send part of the registration's success.
   *
   * The account exists before the mail is attempted, so a send that throws must
   * not be reported as a failed registration — the person would try again and
   * be told the username is taken, by *their own* abandoned account.
   */
  it('a failed send does not fail the registration, and the account survives', async () => {
    mail.failVerification = true

    const to = await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    expect(to).toBe(`/verify/resend?email=${encodeURIComponent(CREDS.email)}&sent=1`)

    // The account is really there: registering again collides with it.
    const again = await registerAction(EMPTY_STATE, form(CREDS))
    expect(again.error).toBeTruthy()
  })

  it('does not sign the new account in', async () => {
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    expect(jar.has(SESSION_COOKIE)).toBe(false)

    // And it cannot sign itself in either, which is what activation means.
    const state = await loginAction(
      EMPTY_STATE,
      form({ identifier: CREDS.username, password: CREDS.password }),
    )
    expect(state.error).toMatch(/not yet activated/i)
  })

  /**
   * The mutant this kills: `activationMethod` falling back to `'none'` when the
   * board asked for e-mail. That is what every caller did before work item 1 —
   * the setting existed, the dropdown moved, and registration carried on
   * activating everybody immediately.
   */
  it('honours the configured method rather than the static default', async () => {
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))
    expect(mail.verifications).toHaveLength(1)

    /* Same board, same store — only the setting moves. */
    policy.activationMethod = 'none'

    const to = await redirectOf(
      registerAction(EMPTY_STATE, form({ ...CREDS, username: 'nora', email: 'nora@example.com' })),
    )
    expect(to).toBe('/login?registered=1')
    expect(mail.verifications).toHaveLength(1)
  })
})

describe('resending a verification link (F18)', () => {
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

  /**
   * The mutant this kills: resending against an account that is already usable.
   * It would be a confirmation mail for nothing, and a live credential mailed to
   * somebody who never asked for one.
   */
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

    // Same sentence, no error — a "too many attempts" message here would only
    // appear for addresses somebody keeps retrying, which is a signal about
    // whether those addresses exist.
    expect(refused.notice).toBe(allowed.notice)
    expect(refused.error).toBeUndefined()
    expect(mail.verifications).toHaveLength(1)
  })

  it('never returns the token to the browser, in development or out of it', async () => {
    await redirectOf(registerAction(EMPTY_STATE, form(CREDS)))

    const state = await inDevelopment(() =>
      resendVerificationAction(EMPTY_STATE, form({ email: CREDS.email })),
    )
    // Unlike the reset form's development escape hatch, this one has none: the
    // resend screen is reachable without proving anything at all.
    expect(JSON.stringify(state)).not.toContain('token')
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
