import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { AccountStore } from '@meith/accounts'

import { createPostgresAccountStore } from './account-repos'
import { createTestDb, type TestDb } from './pglite.fixture'

describe('Postgres federated identity and passkey repositories', () => {
  let h: TestDb
  let store: AccountStore
  let userId: number
  let otherUserId: number

  beforeAll(async () => {
    h = await createTestDb()
    store = createPostgresAccountStore(h.db)

    const account = await store.accounts.create({
      username: 'Ada',
      usernameLower: 'ada',
      email: 'ada@example.com',
      emailLower: 'ada@example.com',
      passwordHash: null,
      passwordAlgo: null,
      state: 'active',
      primaryGroupId: 2,
    })
    userId = account.id

    const other = await store.accounts.create({
      username: 'Grace',
      usernameLower: 'grace',
      email: 'grace@example.com',
      emailLower: 'grace@example.com',
      passwordHash: 'hash',
      passwordAlgo: 'argon2id',
      state: 'active',
      primaryGroupId: 2,
    })
    otherUserId = other.id
  })

  afterAll(async () => {
    await h.close()
  })

  it('stores an account with no password at all', async () => {
    const account = await store.accounts.findById(userId)
    expect(account?.passwordHash).toBeNull()
    expect(account?.passwordAlgo).toBeNull()
  })

  it('links, finds and lists identities per account', async () => {
    const now = new Date('2026-01-01T00:00:00Z')

    const linked = await store.identities.link({
      userId,
      provider: 'github',
      subject: '4242',
      label: 'ada',
      now,
    })

    expect(linked.userId).toBe(userId)
    expect(await store.identities.findBySubject('github', '4242')).toMatchObject({
      id: linked.id,
      label: 'ada',
    })
    expect(await store.identities.findBySubject('google', '4242')).toBeNull()

    await store.identities.link({
      userId,
      provider: 'oidc',
      subject: 'staff-1',
      label: null,
      now,
    })

    const held = await store.identities.listForUser(userId)
    expect(held.map((identity) => identity.provider)).toEqual(['github', 'oidc'])
  })

  it('treats a second link of the same subject as the one already there', async () => {
    const now = new Date('2026-02-01T00:00:00Z')

    const again = await store.identities.link({
      userId,
      provider: 'github',
      subject: '4242',
      label: 'renamed',
      now,
    })

    expect(again.label).toBe('ada')
    expect(await store.identities.listForUser(userId)).toHaveLength(2)
  })

  it('refuses to unlink an identity that belongs to somebody else', async () => {
    const mine = await store.identities.findBySubject('github', '4242')
    expect(await store.identities.unlink(otherUserId, mine!.id)).toBe(false)
    expect(await store.identities.findBySubject('github', '4242')).not.toBeNull()
  })

  it('records when an identity was last used', async () => {
    const used = new Date('2026-03-04T05:06:07Z')
    const identity = await store.identities.findBySubject('github', '4242')

    await store.identities.markUsed(identity!.id, used)

    expect((await store.identities.findBySubject('github', '4242'))?.lastUsedAt).toEqual(used)
  })

  it('unlinks its own identity', async () => {
    const identity = await store.identities.findBySubject('oidc', 'staff-1')
    expect(await store.identities.unlink(userId, identity!.id)).toBe(true)
    expect(await store.identities.findBySubject('oidc', 'staff-1')).toBeNull()
  })

  it('stores passkeys, finds them by credential and counts up the signature counter', async () => {
    const created = await store.passkeys.create({
      userId,
      credentialId: 'cred-1',
      publicKey: 'key-1',
      signCount: 0,
      label: 'Yubikey',
      transports: 'usb,nfc',
      now: new Date('2026-01-02T00:00:00Z'),
    })

    expect(await store.passkeys.findByCredentialId('cred-1')).toMatchObject({
      id: created.id,
      label: 'Yubikey',
      transports: 'usb,nfc',
    })

    await store.passkeys.markUsed(created.id, 7, new Date('2026-01-03T00:00:00Z'))

    const after = await store.passkeys.findByCredentialId('cred-1')
    expect(after?.signCount).toBe(7)
    expect(after?.lastUsedAt).toEqual(new Date('2026-01-03T00:00:00Z'))
  })

  it('refuses to remove a passkey held by another account, then removes its own', async () => {
    const passkey = await store.passkeys.findByCredentialId('cred-1')

    expect(await store.passkeys.remove(otherUserId, passkey!.id)).toBe(false)
    expect(await store.passkeys.remove(userId, passkey!.id)).toBe(true)
    expect(await store.passkeys.listForUser(userId)).toHaveLength(0)
  })
})
