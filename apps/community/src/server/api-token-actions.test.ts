import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
const requireFreshAdminMock = vi.fn(async () => ({ userId: 1 }))
const revalidated: string[] = []

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path)
  },
}))

vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireFreshAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const issued: Array<{ name: string; scopes: readonly string[]; expiresAt: Date | null }> = []
const revocations: number[] = []

vi.mock('./api-tokens-admin', () => ({
  issueApiToken: async (input: {
    name: string
    scopes: readonly string[]
    expiresAt: Date | null
  }) => {
    issued.push({ name: input.name, scopes: input.scopes, expiresAt: input.expiresAt })
    return 'forum_pat_abcd1234_secretsecretsecretsecret'
  },
  apiTokenStore: () => ({
    async revoke(id: number) {
      revocations.push(id)
      return true
    },
  }),
}))

const { issueApiTokenAction, revokeApiTokenAction } = await import('./api-token-actions')

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) data.append(key, one)
  }
  return data
}

const NAMED = { name: 'ci', scopes: 'forums:read' }

beforeEach(() => {
  adminCalls.length = 0
  revalidated.length = 0
  issued.length = 0
  revocations.length = 0
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 1 })
  requireFreshAdminMock.mockClear()
  requireFreshAdminMock.mockResolvedValue({ userId: 1 })
})

describe('the admin gate', () => {
  it('asks for a fresh password before minting a credential', async () => {
    await issueApiTokenAction({}, form(NAMED))

    expect(requireFreshAdminMock).toHaveBeenCalledTimes(1)
    expect(requireAdminMock).not.toHaveBeenCalled()
  })

  it('mints nothing when the proof is stale', async () => {
    requireFreshAdminMock.mockRejectedValue(
      Object.assign(new Error('confirm'), {
        code: 'FORBIDDEN',
        publicMessage: 'Confirm your password again before doing this.',
      }),
    )

    const state = await issueApiTokenAction({}, form(NAMED))

    expect(state.error).toBeDefined()
    expect(state.values?.token).toBeUndefined()
    expect(issued).toEqual([])
    expect(adminCalls).toEqual([])
  })

  it('lets a revocation through on the panel session alone', async () => {
    const state = await revokeApiTokenAction({}, form({ tokenId: '4', confirmed: '1' }))

    expect(state.notice).toBe('revoked')
    expect(requireAdminMock).toHaveBeenCalledTimes(1)
    expect(requireFreshAdminMock).not.toHaveBeenCalled()
    expect(revocations).toEqual([4])
  })

  it('asks to confirm a revocation before it happens', async () => {
    const state = await revokeApiTokenAction({}, form({ tokenId: '4' }))

    expect(state.confirm).toBeDefined()
    expect(revocations).toEqual([])
  })
})

describe('the expiry field', () => {
  it('reads a whole number of days as a deadline', async () => {
    const before = Date.now()
    await issueApiTokenAction({}, form({ ...NAMED, expiresInDays: '30' }))
    const after = Date.now()

    const expiresAt = issued[0]!.expiresAt!
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 86_400_000)
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 30 * 86_400_000)
  })

  it('reads an empty field as the no-expiry the label promises', async () => {
    const state = await issueApiTokenAction({}, form({ ...NAMED, expiresInDays: '   ' }))

    expect(state.notice).toBe('issued')
    expect(issued).toEqual([{ name: 'ci', scopes: ['forums:read'], expiresAt: null }])
  })

  it('reads a field that was never submitted as no expiry too', async () => {
    const state = await issueApiTokenAction({}, form(NAMED))

    expect(state.notice).toBe('issued')
    expect(issued[0]!.expiresAt).toBeNull()
  })

  it.each(['30.5', 'abc', '1e2', '-7', '0', '9007199254740993', '30 days'])(
    'refuses %o rather than reading it as never expires',
    async (value) => {
      const state = await issueApiTokenAction({}, form({ ...NAMED, expiresInDays: value }))

      expect(state.error).toMatch(/whole number of days/)
      expect(state.values?.token).toBeUndefined()
      expect(issued).toEqual([])
      expect(adminCalls).toEqual([])
      expect(revalidated).toEqual([])
    },
  )
})

describe('issuing', () => {
  it('shows the credential once and logs the issue', async () => {
    const state = await issueApiTokenAction({}, form({ name: 'ci', scopes: 'forums:read' }))

    expect(state.notice).toBe('issued')
    expect(state.values?.token).toMatch(/^forum_pat_/)
    expect(adminCalls).toEqual([{ action: 'system.api_token_issued', detail: { name: 'ci' } }])
    expect(revalidated).toEqual(['/admin/api-tokens'])
  })

  it('passes every ticked scope through to the issuer', async () => {
    await issueApiTokenAction({}, form({ name: 'ci', scopes: ['forums:read', 'posts:write'] }))

    expect(issued[0]!.scopes).toEqual(['forums:read', 'posts:write'])
  })
})
