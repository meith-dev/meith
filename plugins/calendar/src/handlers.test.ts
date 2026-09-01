import { describe, expect, it } from 'vitest'

import {
  type PluginRequest,
  type PluginRuntimeContext,
  unavailablePluginRuntime,
} from '@meith/plugin-kit'

import {
  handleAddOrganiser,
  handleCreateEvent,
  handleDeleteEvent,
  handleUpdateEvent,
} from './handlers'

interface Recorded {
  inserts: unknown[][]
  organisers: number[]
  updates?: unknown[][]
  deletes?: unknown[][]
}

function fakeContext(
  recorded: Recorded,
  settings: Record<string, string | boolean> = {},
  member: { userId: number; username: string } | null = null,
  eventRow: Record<string, unknown> | null = null,
): PluginRuntimeContext {
  return {
    ...unavailablePluginRuntime('a test'),
    settings,
    data: {
      async query(text: string, params: readonly unknown[] = []) {
        if (text.includes('select user_id from plugin_calendar_organiser')) {
          return recorded.organisers.map((user_id) => ({ user_id }))
        }
        if (text.includes('insert into plugin_calendar_event')) recorded.inserts.push([...params])
        if (text.includes('update plugin_calendar_event')) {
          recorded.updates ??= []
          recorded.updates.push([...params])
        }
        if (text.includes('delete from plugin_calendar_event')) {
          recorded.deletes ??= []
          recorded.deletes.push([...params])
        }
        if (text.includes('insert into plugin_calendar_organiser')) {
          recorded.organisers.push(Number(params[0]))
        }
        return []
      },
      async one() {
        return eventRow
      },
      async tx<T>(work: (inner: unknown) => Promise<T>) {
        return work(null)
      },
    },
    users: {
      async byUsername() {
        return member
      },
      async byId() {
        return member
      },
    },
  } as PluginRuntimeContext
}

function request(form: Record<string, string> | null, userId: number | null): PluginRequest {
  return {
    viewer: { userId, isGuest: userId === null },
    method: 'POST',
    path: 'events',
    query: {},
    headers: {},
    rawBody: null,
    form,
    json: null,
    boardUrl: 'https://board.example',
  }
}

const GOOD = {
  title: 'Raid night',
  starts_at: '2026-09-01T19:00:00Z',
  ends_at: '',
  location: '',
  thread: '/threads/12',
}

describe('adding an event', () => {
  it('stores it and sends the member back to the calendar', async () => {
    const recorded: Recorded = { inserts: [], organisers: [7] }

    const response = await handleCreateEvent(request(GOOD, 7), fakeContext(recorded))

    expect(response).toEqual({ kind: 'redirect', to: '/plugins/calendar' })
    expect(recorded.inserts).toHaveLength(1)
    expect(recorded.inserts[0]).toEqual([
      'Raid night',
      new Date('2026-09-01T19:00:00Z'),
      null,
      '',
      12,
      7,
      '',
      '',
    ])
  })

  it('refuses a member who is not an organiser, and stores nothing', async () => {
    const recorded: Recorded = { inserts: [], organisers: [9] }

    const response = await handleCreateEvent(request(GOOD, 7), fakeContext(recorded))

    expect(response).toMatchObject({ kind: 'json', status: 403 })
    expect(recorded.inserts).toEqual([])
  })

  it('accepts any member once the board opens it up', async () => {
    const recorded: Recorded = { inserts: [], organisers: [] }

    const response = await handleCreateEvent(
      request(GOOD, 7),
      fakeContext(recorded, { any_member_may_add: true }),
    )

    expect(response).toMatchObject({ kind: 'redirect' })
    expect(recorded.inserts).toHaveLength(1)
  })

  it('reports what was wrong with the draft rather than storing half of it', async () => {
    const recorded: Recorded = { inserts: [], organisers: [7] }

    const response = await handleCreateEvent(
      request({ ...GOOD, title: '  ' }, 7),
      fakeContext(recorded),
    )

    expect(response).toMatchObject({ kind: 'json', status: 400 })
    expect(recorded.inserts).toEqual([])
  })

  it('refuses a request carrying no form at all', async () => {
    const response = await handleCreateEvent(
      request(null, 7),
      fakeContext({ inserts: [], organisers: [7] }),
    )

    expect(response).toMatchObject({ kind: 'json', status: 400 })
  })
})

const EVENT_ROW = {
  id: 5,
  title: 'Raid night',
  starts_at: '2026-09-01T19:00:00Z',
  ends_at: null,
  location: '',
  thread_id: null,
  created_by_user_id: 7,
  link_url: '',
  link_label: '',
}

describe('changing an event', () => {
  it('lets the member who added it rewrite it', async () => {
    const recorded: Recorded = { inserts: [], organisers: [], updates: [], deletes: [] }

    const response = await handleUpdateEvent(
      request({ ...GOOD, id: '5', title: 'Raid night, moved' }, 7),
      fakeContext(recorded, {}, null, EVENT_ROW),
    )

    expect(response).toEqual({ kind: 'redirect', to: '/plugins/calendar' })
    expect(recorded.updates).toHaveLength(1)
    expect(recorded.updates?.[0]?.[0]).toBe('5')
    expect(recorded.updates?.[0]?.[1]).toBe('Raid night, moved')
  })

  it('refuses an unrelated member and changes nothing', async () => {
    const recorded: Recorded = { inserts: [], organisers: [], updates: [], deletes: [] }

    const response = await handleUpdateEvent(
      request({ ...GOOD, id: '5' }, 8),
      fakeContext(recorded, {}, null, EVENT_ROW),
    )

    expect(response).toMatchObject({ kind: 'json', status: 403 })
    expect(recorded.updates).toEqual([])
  })

  it('reports a draft problem rather than storing half an edit', async () => {
    const recorded: Recorded = { inserts: [], organisers: [], updates: [], deletes: [] }

    const response = await handleUpdateEvent(
      request({ ...GOOD, id: '5', title: '  ' }, 7),
      fakeContext(recorded, {}, null, EVENT_ROW),
    )

    expect(response).toMatchObject({ kind: 'json', status: 400 })
    expect(recorded.updates).toEqual([])
  })

  it('refuses an id that is not one', async () => {
    const response = await handleUpdateEvent(
      request({ ...GOOD, id: 'abc' }, 7),
      fakeContext({ inserts: [], organisers: [] }, {}, null, EVENT_ROW),
    )

    expect(response).toMatchObject({ kind: 'json', status: 400 })
  })
})

describe('removing an event', () => {
  it('lets the member who added it remove it', async () => {
    const recorded: Recorded = { inserts: [], organisers: [], updates: [], deletes: [] }

    const response = await handleDeleteEvent(
      request({ id: '5' }, 7),
      fakeContext(recorded, {}, null, EVENT_ROW),
    )

    expect(response).toEqual({ kind: 'redirect', to: '/plugins/calendar' })
    expect(recorded.deletes).toEqual([['5']])
  })

  it('lets an organiser remove somebody else’s', async () => {
    const recorded: Recorded = { inserts: [], organisers: [9], updates: [], deletes: [] }

    const response = await handleDeleteEvent(
      request({ id: '5' }, 9),
      fakeContext(recorded, {}, null, EVENT_ROW),
    )

    expect(response).toMatchObject({ kind: 'redirect' })
    expect(recorded.deletes).toHaveLength(1)
  })

  it('refuses an unrelated member and removes nothing', async () => {
    const recorded: Recorded = { inserts: [], organisers: [], updates: [], deletes: [] }

    const response = await handleDeleteEvent(
      request({ id: '5' }, 8),
      fakeContext(recorded, {}, null, EVENT_ROW),
    )

    expect(response).toMatchObject({ kind: 'json', status: 403 })
    expect(recorded.deletes).toEqual([])
  })

  it('says so when the event has gone', async () => {
    const response = await handleDeleteEvent(
      request({ id: '5' }, 7),
      fakeContext({ inserts: [], organisers: [] }),
    )

    expect(response).toMatchObject({ kind: 'json', status: 404 })
  })
})

describe('adding an organiser', () => {
  it('resolves the username and records the id', async () => {
    const recorded: Recorded = { inserts: [], organisers: [] }

    const response = await handleAddOrganiser(
      request({ username: 'ada' }, 1),
      fakeContext(recorded, {}, { userId: 42, username: 'ada' }),
    )

    expect(response).toMatchObject({ kind: 'redirect' })
    expect(recorded.organisers).toEqual([42])
  })

  it('says so when nobody has that name', async () => {
    const response = await handleAddOrganiser(
      request({ username: 'nobody' }, 1),
      fakeContext({ inserts: [], organisers: [] }),
    )

    expect(response).toMatchObject({ kind: 'json', status: 404 })
  })

  it('refuses an empty username', async () => {
    const response = await handleAddOrganiser(
      request({ username: '   ' }, 1),
      fakeContext({ inserts: [], organisers: [] }),
    )

    expect(response).toMatchObject({ kind: 'json', status: 400 })
  })
})
