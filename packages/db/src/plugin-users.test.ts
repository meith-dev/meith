import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { pluginUsers } from './plugin-users'
import { createTestDb, type TestDb } from './pglite.fixture'
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
