import { expect, it, vi } from 'vitest'

import { type PluginData, unavailablePluginRuntime } from '@meith/plugin-kit'

import { evaluateAwards, queueMember } from './tasks'

function setup(count: number, dirtyIds: number[]) {
  const members = Array.from({ length: count }, (_, i) => ({
    userId: i + 1,
    username: `Member${i + 1}`,
    postCount: 5,
    threadCount: 2,
    reputation: 3,
    registeredAt: new Date('2020-01-01'),
  }))
  const rule = {
    id: 1,
    awardId: 1,
    title: 'Contributor',
    enabled: true,
    minPostCount: 1,
    minThreadCount: null,
    minReputation: null,
    minDaysRegistered: null,
  }
  const state = { cursor: 0, completed: false, dirty: new Set(dirtyIds), grants: new Set<string>() }
  const query = vi.fn(
    async <T extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<readonly T[]> => {
      let rows: Record<string, unknown>[] = []
      if (sql.includes('from plugin_awards_rule')) rows = [rule]
      if (sql.includes('delete from plugin_awards_dirty')) {
        const ids = [...state.dirty].slice(0, Number(params[0]))
        for (const id of ids) state.dirty.delete(id)
        rows = ids.map((user_id) => ({ user_id }))
      }
      if (sql.includes('insert into plugin_awards_dirty')) {
        for (const id of Array.isArray(params[0]) ? params[0] : [params[0]])
          state.dirty.add(Number(id))
      }
      return rows as T[]
    },
  )
  const one = async <T extends Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> => {
    let row: Record<string, unknown> | null = null
    if (sql.includes('select cursor')) row = { cursor: state.cursor }
    if (sql.includes('update plugin_awards_scan') && state.cursor === params[2]) {
      state.cursor = Number(params[0])
      state.completed = Boolean(params[1])
      row = { cursor: state.cursor }
    }
    if (sql.includes('for update')) row = { id: 1, archived_at: null, allow_multiple: true }
    if (sql.includes('insert into plugin_awards_grant')) {
      const key = `${params[4]}:${params[1]}`
      if (!state.grants.has(key)) {
        state.grants.add(key)
        row = { id: state.grants.size }
      }
    }
    return row as T | null
  }
  const data: PluginData = { query, one, tx: (work) => work(data) }
  const base = unavailablePluginRuntime('test')
  const context = {
    ...base,
    data,
    users: {
      ...base.users,
      standing: vi.fn(async (ids: readonly number[]) =>
        members.filter((member) => ids.includes(member.userId)),
      ),
      scan: vi.fn(async ({ afterUserId, limit }: { afterUserId: number; limit: number }) =>
        members.filter((member) => member.userId > afterUserId).slice(0, limit),
      ),
    },
    notify: { send: vi.fn(async () => {}) },
  }
  return { state, context, query }
}

it('drains only 500 dirty ids in batches of 200 and advances at most 1,000 scan members', async () => {
  const { context, state } = setup(
    1300,
    Array.from({ length: 501 }, (_, i) => i + 1),
  )
  await evaluateAwards(context)
  expect(context.users.standing.mock.calls.map(([ids]) => ids.length)).toEqual([200, 200, 100])
  expect(state.dirty.size).toBe(1)
  expect(state.cursor).toBe(1000)
  expect(context.users.scan).toHaveBeenCalledTimes(5)
  expect(state.grants.size).toBe(1000)
  expect(context.notify.send).toHaveBeenCalledTimes(1000)
  await evaluateAwards(context)
  expect(state.cursor).toBe(0)
  expect(state.completed).toBe(true)
  expect(state.dirty.size).toBe(0)
  expect(state.grants.size).toBe(1300)
})

it('wraps an empty scan and is idempotent on a double run', async () => {
  const { context, state } = setup(2, [1])
  await queueMember(context, 1)
  await evaluateAwards(context)
  await evaluateAwards(context)
  expect(state.completed).toBe(true)
  expect(state.cursor).toBe(0)
  expect(context.notify.send).toHaveBeenCalledTimes(2)
  const empty = setup(0, [99])
  await evaluateAwards(empty.context)
  expect(empty.state.dirty.size).toBe(0)
  expect(empty.state.completed).toBe(true)
})

it('requeues a claimed dirty batch after failure and resumes a failed scan from its saved cursor', async () => {
  const { context, state } = setup(3, [1, 2])
  context.users.standing.mockRejectedValueOnce(new Error('offline'))
  await expect(evaluateAwards(context)).rejects.toThrow('offline')
  expect([...state.dirty]).toEqual([1, 2])
  context.users.scan.mockRejectedValueOnce(new Error('scan offline'))
  await expect(evaluateAwards(context)).rejects.toThrow('scan offline')
  expect(state.cursor).toBe(0)
  await evaluateAwards(context)
  expect(state.grants.size).toBe(3)
  expect(context.notify.send).toHaveBeenCalledTimes(3)
})
