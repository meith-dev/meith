import { describe, expect, it } from 'vitest'

import { sourceTranslator } from '@meith/i18n'

import { renderNotification } from './render'
import type { NotificationRecord } from './types'

const BASE: NotificationRecord = {
  id: 7,
  userId: 1,
  kind: 'warning.received',
  data: { title: 'Spamming', points: 2, totalPoints: 4 },
  href: null,
  occurrences: 1,
  createdAt: new Date('2026-07-30T09:00:00Z'),
  updatedAt: new Date('2026-07-30T09:00:00Z'),
  readAt: null,
}

function render(over: Partial<NotificationRecord> = {}) {
  return renderNotification({ ...BASE, ...over })
}

describe('warning.received', () => {
  it('names the warning, its points and the new total', () => {
    const view = render()
    expect(view.subject).toBe('You have been warned: Spamming')
    expect(view.body).toContain('worth 2 points')
    expect(view.body).toContain('total is now 4 points')
  })

  it('says what the restriction means when one was applied', () => {
    const view = render({
      data: { ...BASE.data, restriction: 'suspend_posting' },
    })
    expect(view.body).toContain('cannot post')
  })

  it('says nothing about restrictions when none was reached', () => {
    expect(render().body).not.toContain('cannot post')
  })

  it('uses singular units for one point', () => {
    const view = render({ data: { title: 'Spamming', points: 1, totalPoints: 1 } })
    expect(view.body).toContain('worth 1 point.')
  })
})

describe('a row this build did not write', () => {
  it('renders an unknown kind as itself rather than throwing', () => {
    const view = render({ kind: 'poll.closed', data: {} })
    expect(view.subject).toContain('poll.closed')
    expect(view.body).toBe('')
  })

  it('survives data with every expected field missing', () => {
    const view = render({ data: {} })
    expect(view.subject).toBe('You have been warned: a rule breach')
    expect(view.body).toContain('0 points')
  })

  it('survives a number stored where a string is read, and the reverse', () => {
    const view = render({ data: { title: 42, points: '3', totalPoints: 'nonsense' } })
    expect(view.subject).toBe('You have been warned: 42')
    expect(view.body).toContain('worth 3 points')
    expect(view.body).toContain('total is now 0 points')
  })
})

describe('repetition', () => {
  it('folds the occurrence count into the subject', () => {
    const view = render({
      kind: 'system.task_failed',
      data: { taskId: 'queue.drain' },
      occurrences: 40,
    })
    expect(view.subject).toBe('Scheduled task failed: queue.drain (40 times)')
  })

  it('says nothing about repetition when something happened once', () => {
    expect(render().subject).not.toContain('times')
  })
})

describe('board.digest', () => {
  it('names the cadence and the thread count in the subject', () => {
    const view = render({
      kind: 'board.digest',
      data: {
        cadence: 'monthly',
        threadCount: 3,
        threads: [{ title: 'A busy thread', forumTitle: 'General' }],
        more: 0,
      },
    })

    expect(view.subject).toContain('monthly digest')
    expect(view.subject).toContain('3 threads')
    expect(view.body).toContain('A busy thread — General')
  })

  it('counts the threads left out of the list', () => {
    const view = render({
      kind: 'board.digest',
      data: {
        cadence: 'weekly',
        threadCount: 12,
        threads: [{ title: 'One', forumTitle: 'General' }],
        more: 11,
      },
    })

    expect(view.body).toContain('and 11 more')
  })

  it('carries the unsubscribe token from the payload', () => {
    const view = render({
      kind: 'board.digest',
      data: { cadence: 'weekly', threadCount: 1, threads: [], more: 0, unsubscribe: 'tok.en' },
    })

    expect(view.unsubscribeToken).toBe('tok.en')
  })
})

describe('report.actioned', () => {
  it('distinguishes an action from a dismissal', () => {
    const resolved = render({
      kind: 'report.actioned',
      data: { outcome: 'resolved', targetLabel: 'a post by ivan' },
    })
    const rejected = render({
      kind: 'report.actioned',
      data: { outcome: 'rejected', targetLabel: 'a post by ivan' },
    })

    expect(resolved.subject).toContain('actioned')
    expect(rejected.subject).toContain('without action')
    expect(rejected.body).toContain('a post by ivan')
  })

  it('cannot carry a moderator note, because the data never holds one', () => {
    const view = render({
      kind: 'report.actioned',
      data: { outcome: 'resolved', targetLabel: 'a post', note: 'obvious spam, banned' },
    })
    expect(view.body).not.toContain('obvious spam')
  })
})

describe('read state', () => {
  it('reports whether the row has been read', () => {
    expect(render().isRead).toBe(false)
    expect(render({ readAt: new Date() }).isRead).toBe(true)
  })
})

describe('a plugin kind', () => {
  it('renders the subject and body the plugin raised, and keeps the href', () => {
    const view = renderNotification({
      id: 9,
      userId: 7,
      kind: 'plugin.dues.gift_received',
      data: { subject: 'You were gifted a pass', body: 'From alice.' },
      href: '/plugins/dues/manage',
      occurrences: 1,
      createdAt: new Date('2026-08-11T00:00:00Z'),
      updatedAt: new Date('2026-08-11T00:00:00Z'),
      readAt: null,
    })
    expect(view.subject).toBe('You were gifted a pass')
    expect(view.body).toBe('From alice.')
    expect(view.href).toBe('/plugins/dues/manage')
  })

  it('falls back to a plain subject when the data is empty', () => {
    const view = renderNotification({
      id: 10,
      userId: 7,
      kind: 'plugin.dues.gift_received',
      data: {},
      href: null,
      occurrences: 1,
      createdAt: new Date('2026-08-11T00:00:00Z'),
      updatedAt: new Date('2026-08-11T00:00:00Z'),
      readAt: null,
    })
    expect(view.subject).toBe('A plugin has news for you')
  })

  it('renders stored plugin catalog keys with the recipient translator', () => {
    const view = renderNotification(
      {
        id: 11,
        userId: 7,
        kind: 'plugin.reference.poked',
        data: {
          subjectKey: 'reference.notification.poked.subject',
          subjectArgs: '{"plan":"Gold"}',
          bodyKey: 'reference.notification.poked.body',
          bodyArgs: '{"count":2}',
        },
        href: '/reference',
        occurrences: 1,
        createdAt: new Date('2026-08-11T00:00:00Z'),
        updatedAt: new Date('2026-08-11T00:00:00Z'),
        readAt: null,
      },
      sourceTranslator({
        'reference.notification.poked.subject': 'Plan {plan}',
        'reference.notification.poked.body': '{count, plural, one {One hook} other {# hooks}}',
      }),
    )

    expect(view).toMatchObject({ subject: 'Plan Gold', body: '2 hooks', href: '/reference' })
  })
})
