import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createTestDb, type TestDb } from './pglite.fixture'
import { pluginUsers } from './plugin-users'
import { usergroups, users } from './schema'

let h: TestDb
let groupId: number

beforeAll(async () => {
  h = await createTestDb()
})
afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.db.delete(users)
  await h.db.delete(usergroups)
  const [group] = await h.db
    .insert(usergroups)
    .values({ key: 'members', title: 'Members' })
    .returning({ id: usergroups.id })
  groupId = group!.id
})

async function member(username: string, state = 'active'): Promise<number> {
  const lower = username.toLowerCase()
  const [row] = await h.db
    .insert(users)
    .values({
      username,
      usernameLower: lower,
      email: `${lower}@example.com`,
      emailLower: `${lower}@example.com`,
      state,
      primaryGroupId: groupId,
    })
    .returning({ id: users.id })
  return row!.id
}

describe('pluginUsers', () => {
  it('resolves by username, case-insensitively, to id and public name only', async () => {
    const id = await member('MacTíre')

    const found = await pluginUsers(h.db).byUsername('  mactíre ')
    expect(found).toEqual({ userId: id, username: 'MacTíre' })
    expect(Object.keys(found!).sort()).toEqual(['userId', 'username'])
  })

  it('resolves by id', async () => {
    const id = await member('Alice')
    expect(await pluginUsers(h.db).byId(id)).toEqual({ userId: id, username: 'Alice' })
  })

  it('returns null for the missing, the deleted, and nonsense input', async () => {
    const deleted = await member('Ghost', 'deleted')
    const lookup = pluginUsers(h.db)

    expect(await lookup.byUsername('nobody')).toBeNull()
    expect(await lookup.byUsername('ghost')).toBeNull()
    expect(await lookup.byId(deleted)).toBeNull()
    expect(await lookup.byUsername('   ')).toBeNull()
    expect(await lookup.byId(-1)).toBeNull()
    expect(await lookup.byId(2.5)).toBeNull()
  })

  it('still resolves a banned member — refusing them is the plugin’s own decision', async () => {
    const id = await member('Trouble', 'banned')
    expect(await pluginUsers(h.db).byId(id)).toEqual({ userId: id, username: 'Trouble' })
  })
})

it('reads only public standing and excludes deleted accounts in both batch APIs', async () => {
  const first = await member('First')
  const deleted = await member('Gone', 'deleted')
  const last = await member('Last')
  const lookup = pluginUsers(h.db)
  const standing = await lookup.standing([last, deleted, first, first])
  expect(standing.map((row) => row.userId)).toEqual([first, last])
  expect(standing[0]).toEqual({
    userId: first,
    username: 'First',
    postCount: 0,
    threadCount: 0,
    reputation: 0,
    registeredAt: expect.any(Date),
  })
  expect(await lookup.scan({ afterUserId: first, limit: 200 })).toEqual([standing[1]])
  expect(await lookup.scan({ afterUserId: last, limit: 200 })).toEqual([])
  expect(await lookup.standing([])).toEqual([])
  await expect(lookup.standing(Array(201).fill(first))).rejects.toThrow('200')
  await expect(lookup.standing([-1])).rejects.toThrow('positive')
})

it('caps scans at 200 and honours smaller limits and cursors', async () => {
  await h.db.insert(users).values(
    Array.from({ length: 205 }, (_, i) => ({
      username: `Batch${i}`,
      usernameLower: `batch${i}`,
      email: `batch${i}@example.com`,
      emailLower: `batch${i}@example.com`,
      primaryGroupId: groupId,
      postCount: i,
      threadCount: i + 1,
      reputation: i + 2,
    })),
  )
  const lookup = pluginUsers(h.db)
  const rows = await lookup.scan({ afterUserId: 0, limit: 999 })
  expect(rows).toHaveLength(200)
  expect(rows[0]).toMatchObject({ postCount: 0, threadCount: 1, reputation: 2 })
  expect(await lookup.scan({ afterUserId: rows[199]!.userId, limit: 2 })).toHaveLength(2)
  expect(await lookup.scan({ afterUserId: 0, limit: -5 })).toEqual([])
  await expect(lookup.scan({ afterUserId: -1, limit: 1 })).rejects.toThrow('cursor')
  await expect(lookup.scan({ afterUserId: 0, limit: Number.NaN })).rejects.toThrow('finite')
})
