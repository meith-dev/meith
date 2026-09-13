import { expect, it, vi } from 'vitest'

import { createTranslator } from '@meith/i18n'
import { type PluginPageContext, unavailablePluginRuntime } from '@meith/plugin-kit'

import { createTestDb } from '../../../packages/db/src/pglite.fixture'
import { pluginData } from '../../../packages/db/src/plugin-data'
import { applyPluginMigration } from '../../../packages/db/src/upgrade-repo'
import { CALENDAR_MIGRATIONS } from './schema'
import { agendaEvents, windowEvents } from './store'
import { CalendarPage } from './ui/page'

it('keeps existing events readable through the host data boundary after an upgrade', async () => {
  const h = await createTestDb()
  try {
    for (const migration of CALENDAR_MIGRATIONS.slice(0, 2)) {
      await applyPluginMigration(h.db, 'calendar', migration.id, migration.statements)
    }
    await h.client.exec(`insert into plugin_calendar_event (title, starts_at)
      values ('Existing event', '2026-09-20T19:00:00Z'),
      ('Distant future event', '2030-01-01T19:00:00Z'),
      ('Older past event', '2025-01-01T19:00:00Z')`)
    for (const migration of CALENDAR_MIGRATIONS.slice(2)) {
      await applyPluginMigration(h.db, 'calendar', migration.id, migration.statements)
    }
    const data = pluginData(h.db, 'calendar')
    const events = await windowEvents(data, new Date('2026-09-01'), new Date('2026-10-01'))
    expect(events.map((event) => event.title)).toEqual(['Existing event'])
    const now = new Date('2026-09-13T12:00:00Z')
    expect((await agendaEvents(data, now)).map((event) => event.title)).toEqual([
      'Existing event',
      'Distant future event',
    ])
    expect((await agendaEvents(data, now, true)).map((event) => event.title)).toEqual([
      'Older past event',
    ])
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    const context: PluginPageContext = {
      ...unavailablePluginRuntime('test'),
      data,
      viewer: { userId: null, isGuest: true },
      path: '',
      query: {},
      boardUrl: '',
      locale: 'en',
      t: createTranslator({ locale: 'en', catalog: {} }),
    }
    expect(JSON.stringify(await CalendarPage(context))).toContain('Distant future event')
    const pastPage = JSON.stringify(await CalendarPage({ ...context, query: { show: 'past' } }))
    expect(pastPage).toContain('Older past event')
    expect(pastPage).toContain('?month=2026-08')
    expect(
      JSON.stringify(await CalendarPage({ ...context, query: { month: '2026-09' } })),
    ).not.toContain('Distant future event')
    await expect(
      CalendarPage({
        ...context,
        data: {
          ...data,
          query: async () => {
            throw new Error('database unavailable')
          },
        },
      }),
    ).rejects.toThrow('database unavailable')
    await h.client.exec(`insert into plugin_calendar_event (title, starts_at, repeat, repeat_until) values
      ('Weekly', '2020-01-06T19:00:00Z', 'weekly', null),
      ('Monthly', '2020-01-31T19:00:00Z', 'monthly', null),
      ('Ended series', '2020-01-01T19:00:00Z', 'weekly', '2020-01-08');
      insert into plugin_calendar_event (title, starts_at, ends_at)
      values ('Still running', '2026-09-12T19:00:00Z', '2026-09-14T19:00:00Z')`)
    expect((await agendaEvents(data, now, false, 3)).map((event) => event.title)).toEqual([
      'Still running',
      'Weekly',
      'Existing event',
    ])
    expect(
      (await agendaEvents(data, now, true, 3)).map((event) => event.startsAt.toISOString()),
    ).toEqual(['2026-09-07T19:00:00.000Z', '2026-08-31T19:00:00.000Z', '2026-08-31T19:00:00.000Z'])
    await h.client.exec("delete from plugin_calendar_event where title <> 'Monthly'")
    expect(await agendaEvents(data, now)).toHaveLength(50)
    expect(await agendaEvents(data, now, true)).toHaveLength(47)
    for (const past of [false, true]) {
      const first = await agendaEvents(data, now, past, 10)
      const second = await agendaEvents(data, now, past, 10, first.at(-1))
      expect(second).toHaveLength(10)
      expect(
        second.some((event) =>
          first.some((item) => item.startsAt.getTime() === event.startsAt.getTime()),
        ),
      ).toBe(false)
      expect(await agendaEvents(data, now, past, 10, second[0], true)).toEqual(first)
    }
    await h.client.exec('delete from plugin_calendar_event')
    await h.client.exec(`insert into plugin_calendar_event (title, starts_at)
      select 'Future ' || n, '2030-01-01T19:00:00Z'::timestamptz from generate_series(1, 120) n;
      insert into plugin_calendar_event (title, starts_at)
      select 'Past ' || n, '2025-01-01T19:00:00Z'::timestamptz from generate_series(1, 120) n`)
    for (const past of [false, true]) {
      const first = await agendaEvents(data, now, past)
      const second = await agendaEvents(data, now, past, 50, first.at(-1))
      const third = await agendaEvents(data, now, past, 50, second.at(-1))
      expect([first.length, second.length, third.length]).toEqual([50, 50, 20])
      expect(new Set([...first, ...second, ...third].map((event) => event.id)).size).toBe(120)
      expect(await agendaEvents(data, now, past, 50, second[0], true)).toEqual(first)
      const after = `${first.at(-1)!.startsAt.getTime()}:${first.at(-1)!.id}`
      const page = JSON.stringify(
        await CalendarPage({ ...context, query: { show: past ? 'past' : '', after } }),
      )
      expect(page).toContain('Previous page')
      expect(page).toContain('Next page')
      expect(page).toContain(past ? '?show=past&before=' : '?before=')
      const last = JSON.stringify(
        await CalendarPage({
          ...context,
          query: {
            show: past ? 'past' : '',
            after: `${second.at(-1)!.startsAt.getTime()}:${second.at(-1)!.id}`,
          },
        }),
      )
      expect(last).not.toContain('Next page')
    }
    expect(
      JSON.stringify(await CalendarPage({ ...context, query: { after: 'invalid' } })),
    ).not.toContain('Previous page')
  } finally {
    vi.useRealTimers()
    await h.close()
  }
})
