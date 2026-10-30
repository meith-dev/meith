import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type AccountStore, createMemoryStore } from '@meith/accounts'
import { ACTORS } from '@meith/authorization/fixture'

const state = vi.hoisted(() => ({ store: null as AccountStore | null }))
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('redirect')
  },
}))
vi.mock('./container', () => ({ getContainer: () => ({ accountStore: state.store }) }))
vi.mock('./context', () => ({ getActor: async () => ACTORS.registered }))
vi.mock('./auth-events', () => ({ recordAuthEvent: async () => undefined }))
vi.mock('./i18n', () => ({ tr: async (key: string) => key }))
vi.mock('./session-cookies', () => ({ readSessionToken: async () => undefined }))

const { revokeSessionAction } = await import('./session-actions')

beforeEach(() => {
  state.store = createMemoryStore()
})

async function setup() {
  const store = state.store!
  const expiresAt = new Date(Date.now() + 60_000)
  const userId = ACTORS.registered.userId!
  const target = await store.sessions.create({ tokenHash: 'target', userId, expiresAt })
  await store.sessions.create({ tokenHash: 'other-device', userId, expiresAt })
  await store.remember.issue({ tokenHash: 'remember', userId, familyId: 'family', expiresAt })
  await store.remember.issue({
    tokenHash: 'another-user',
    userId: 999,
    familyId: 'other',
    expiresAt,
  })
  const form = new FormData()
  form.set('sessionId', String(target.id))
  return { store, form }
}

describe('individual session revocation', () => {
  it('blocks remembered re-entry while preserving other live sessions and other accounts', async () => {
    const { store, form } = await setup()
    await expect(revokeSessionAction({}, form)).rejects.toThrow('redirect')
    expect((await store.sessions.findByTokenHash('target'))?.revokedAt).not.toBeNull()
    expect((await store.sessions.findByTokenHash('other-device'))?.revokedAt).toBeNull()
    expect((await store.remember.findByTokenHash('remember'))?.revokedAt).not.toBeNull()
    expect((await store.remember.findByTokenHash('another-user'))?.revokedAt).toBeNull()
  })

  it('does not clear remember tokens for an unowned session', async () => {
    const { store, form } = await setup()
    form.set('sessionId', '999')
    expect(await revokeSessionAction({}, form)).toHaveProperty('error')
    expect((await store.remember.findByTokenHash('remember'))?.revokedAt).toBeNull()
  })

  it('leaves the operation retryable if remember revocation fails', async () => {
    const { store, form } = await setup()
    vi.spyOn(store.remember, 'revokeAllForUser').mockRejectedValueOnce(
      new Error('database offline'),
    )
    expect(await revokeSessionAction({}, form)).toHaveProperty('error')
    expect((await store.sessions.findByTokenHash('target'))?.revokedAt).toBeNull()
    await expect(revokeSessionAction({}, form)).rejects.toThrow('redirect')
  })
})
