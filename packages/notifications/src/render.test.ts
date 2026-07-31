/**
 * F55 — rendering, and the four ways a stored row can be odd.
 *
 * Every case here is reachable without anybody doing anything wrong: a row
 * written by a previous deploy outlives the code that wrote it. The property
 * these tests defend is that **nothing throws** — a notification centre that
 * 500s on one strange row is worse in every way than one that renders it flat.
 */
import { describe, expect, it } from 'vitest'

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
    const view = render({ kind: 'pm.received', data: {} })
    expect(view.subject).toContain('pm.received')
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
    /* Not NaN: an unparseable number falls back rather than propagating. */
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
      /* Even if a caller captured one, no template reads it. */
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
