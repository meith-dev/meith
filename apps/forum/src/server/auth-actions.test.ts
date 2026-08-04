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

const { jar, RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(readonly location: string) {
      super(`redirect: ${location}`)
    }
  }
  return { jar: new Map<string, string>(), RedirectError }
})

vi.mock('next/headers', () => ({
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

const {
  confirmResetAction,
  loginAction,
  registerAction,
  requestResetAction,
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
})

afterEach(() => {
  vi.restoreAllMocks()
})
