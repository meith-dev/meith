import { expect, it, vi } from 'vitest'

import { type PluginRequest, unavailablePluginRuntime } from '@meith/plugin-kit'

import { handleAward, handleGrant } from './handlers'

function request(form: Record<string, string>): PluginRequest {
  return {
    form,
    viewer: { userId: 1, isGuest: false },
    method: 'POST',
    path: '',
    query: {},
    headers: {},
    rawBody: null,
    json: null,
    boardUrl: 'https://board.test',
  }
}

function setup() {
  const context = unavailablePluginRuntime('test')
  const query = vi.fn(async () => [])
  let inserted = false
  const one = vi.fn(async <T extends Record<string, unknown>>(sql: string): Promise<T | null> => {
    if (sql.includes('insert into plugin_awards_grant')) {
      if (inserted) return null
      inserted = true
      return { id: 99 } as unknown as T
    }
    return { id: 2, archived_at: null, allow_multiple: false } as unknown as T
  })
  const data = {
    query,
    one,
    tx: async <T>(work: (tx: typeof data) => Promise<T>): Promise<T> => work(data),
  }
  const notify = { send: vi.fn(async () => {}) }
  return {
    ...context,
    data,
    notify,
    users: {
      ...context.users,
      byUsername: vi.fn(async (name: string) =>
        name === 'alice' ? { userId: 7, username: 'Alice' } : null,
      ),
    },
  }
}

it('redirects invalid forms without writing and resolves every name before granting', async () => {
  const context = setup()
  expect(await handleAward(request({ name: '' }), context)).toMatchObject({
    to: expect.stringContaining('notice=invalid'),
  })
  expect(
    await handleGrant(request({ award_id: '2', usernames: 'alice, nobody' }), context),
  ).toMatchObject({ to: expect.stringContaining('notice=unknown') })
  expect(context.data.one.mock.calls.some(([sql]) => sql.includes('insert'))).toBe(false)
  expect(context.notify.send).not.toHaveBeenCalled()
})

it('notifies only successful grants, then reports an already-held award', async () => {
  const context = setup()
  const form = request({ award_id: '2', usernames: ' Alice, alice ', reason: 'Thank you' })
  expect(await handleGrant(form, context)).toMatchObject({
    to: expect.stringContaining('notice=granted'),
  })
  expect(await handleGrant(form, context)).toMatchObject({
    to: expect.stringContaining('notice=already'),
  })
  expect(context.notify.send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ userId: 7, dedupeKey: 'grant:99' }),
  )
})

it('honours notification settings', async () => {
  const context = { ...setup(), settings: { notify_on_grant: false } }
  await handleGrant(request({ award_id: '2', usernames: 'alice' }), context)
  expect(context.notify.send).not.toHaveBeenCalled()
})
