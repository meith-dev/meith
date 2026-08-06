import { describe, expect, it } from 'vitest'

import type { FolderCounts, MessageListRow } from '@meith/messages'

import { buildMessageFolderView, messageNotice, quotaView } from './messages'

const NOW = new Date('2026-08-01T12:00:00Z')

const COUNTS: FolderCounts = { inbox: 3, sent: 2, trash: 1, unread: 2, stored: 6 }

function row(overrides: Partial<MessageListRow> = {}): MessageListRow {
  return {
    copyId: 1,
    messageId: 10,
    folder: 'inbox',
    role: 'to',
    subject: 'Hello',
    sentAt: new Date('2026-08-01T11:00:00Z'),
    readAt: null,
    counterparties: ['ivan'],
    moreCounterparties: 0,
    ...overrides,
  }
}

function build(overrides: Partial<Parameters<typeof buildMessageFolderView>[0]> = {}) {
  return buildMessageFolderView({
    folder: 'inbox',
    rows: [row()],
    counts: COUNTS,
    quota: 0,
    nextBefore: null,
    now: NOW,
    ...overrides,
  })
}

describe('quotaView', () => {
  it('treats 0 as unlimited rather than as a store of zero', () => {
    const view = quotaView(COUNTS, 0)
    expect(view.isFull).toBe(false)
    expect(view.isNearlyFull).toBe(false)
    expect(view.label).toBe('6 stored')
  })

  it('is full at the limit, not one past it', () => {
    expect(quotaView({ ...COUNTS, stored: 10 }, 10).isFull).toBe(true)
    expect(quotaView({ ...COUNTS, stored: 9 }, 10).isFull).toBe(false)
  })

  it('warns before the limit rather than at it', () => {
    expect(quotaView({ ...COUNTS, stored: 90 }, 100).isNearlyFull).toBe(true)
    expect(quotaView({ ...COUNTS, stored: 89 }, 100).isNearlyFull).toBe(false)
  })
})

describe('folder tabs', () => {
  it('counts unread on the inbox and everything on the others', () => {
    const tabs = build().tabs
    expect(tabs.map((tab) => [tab.folder, tab.count])).toEqual([
      ['inbox', 2],
      ['sent', 2],
      ['trash', 1],
    ])
  })

  it('marks the current folder and links the others', () => {
    const tabs = build({ folder: 'trash' }).tabs
    expect(tabs.find((tab) => tab.isCurrent)?.folder).toBe('trash')
    expect(tabs.map((tab) => tab.href)).toEqual([
      '/messages',
      '/messages?folder=sent',
      '/messages?folder=trash',
    ])
  })
})

describe('rows', () => {
  it('labels the counterparty column by folder', () => {
    expect(build().rows[0]?.peopleLabel).toBe('From')
    expect(build({ rows: [row({ folder: 'sent', role: 'author' })] }).rows[0]?.peopleLabel).toBe(
      'To',
    )
  })

  it('never shows the author their own sent copy as new', () => {
    const view = build({ rows: [row({ folder: 'sent', role: 'author', readAt: null })] })
    expect(view.rows[0]?.isUnread).toBe(false)
  })

  it('shows an unread received copy as new', () => {
    expect(build().rows[0]?.isUnread).toBe(true)
  })

  it('joins names and counts the rest rather than truncating one', () => {
    expect(build({ rows: [row({ counterparties: ['a', 'b'] })] }).rows[0]?.people).toBe('a and b')
    expect(
      build({ rows: [row({ counterparties: ['a', 'b', 'c'], moreCounterparties: 4 })] }).rows[0]
        ?.people,
    ).toBe('a, b, c and 4 others')
    expect(
      build({ rows: [row({ counterparties: ['a', 'b', 'c'], moreCounterparties: 1 })] }).rows[0]
        ?.people,
    ).toBe('a, b, c and 1 other')
  })

  it('says something rather than nothing when every counterparty is hidden', () => {
    expect(
      build({ rows: [row({ counterparties: [], moreCounterparties: 0 })] }).rows[0]?.people,
    ).toBe('—')
  })

  it('gives an empty subject something to click on', () => {
    expect(build({ rows: [row({ subject: '' })] }).rows[0]?.subject).toBe('(no subject)')
  })
})

describe('paging', () => {
  it('keeps the folder in the next link', () => {
    expect(build({ nextBefore: 12 }).nextHref).toBe('/messages?before=12')
    expect(build({ folder: 'trash', nextBefore: 12 }).nextHref).toBe(
      '/messages?folder=trash&before=12',
    )
  })

  it('offers no link when there is no next page', () => {
    expect(build().nextHref).toBeNull()
  })
})

describe('messageNotice', () => {
  it('reports counts with the right plural', () => {
    expect(messageNotice({ moved: '1' })?.message).toBe('1 message moved.')
    expect(messageNotice({ deleted: '3' })?.message).toBe('3 messages deleted.')
    expect(messageNotice({ sent: '1' })?.message).toContain('sent')
  })

  it('reads a nonsense count as zero rather than printing it', () => {
    expect(messageNotice({ moved: 'lots' })?.message).toBe('0 messages moved.')
  })

  it('is null when nothing happened', () => {
    expect(messageNotice({})).toBeNull()
  })
})
