import { describe, expect, it } from 'vitest'

import { type MailBrand, renderNotificationMail } from './mail'
import type { NotificationView } from './render'

const BRAND: MailBrand = {
  boardName: 'Test Board',
  boardUrl: 'https://board.example',
  accent: '#aa0044',
}

const VIEW: NotificationView = {
  id: 1,
  subject: 'You have been warned: Spamming',
  body: 'You received a warning worth 2 points.\n\nReason given: stop it',
  href: '/notifications',
  kind: 'warning.received',
  occurrences: 1,
  createdAt: new Date('2026-07-31T10:00:00Z'),
  updatedAt: new Date('2026-07-31T10:00:00Z'),
  isRead: false,
  unsubscribeToken: null,
}

function render(view: Partial<NotificationView> = {}, brand: Partial<MailBrand> = {}) {
  return renderNotificationMail({
    view: { ...VIEW, ...view },
    brand: { ...BRAND, ...brand },
    recipientName: 'ivan',
  })
}

const OWN_TAGS = /<\/?(?:div|p|a|br|hr)(?:\s[^<>]*)?>/g

describe('safety', () => {
  it('every "<" in the output is one this package wrote', () => {
    const hostile = '<script>alert(1)</script>'
    const mail = renderNotificationMail({
      view: { ...VIEW, subject: hostile, body: hostile },
      brand: { ...BRAND, boardName: hostile },
      recipientName: hostile,
    })

    const remaining = mail.html.replace(OWN_TAGS, '')
    expect(remaining).not.toContain('<')
    expect(mail.html).not.toContain('<script')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('escapes a quote that would otherwise break out of an attribute', () => {
    const mail = render({ href: '/x' }, { boardName: 'a" onload="alert(1)' })
    expect(mail.html).not.toContain('" onload="')
    expect(mail.html).toContain('a&quot; onload=&quot;alert(1)')
  })

  it('refuses a colour that is not a colour', () => {
    const mail = render({}, { accent: 'red; background:url(https://tracker.test/x)' })
    expect(mail.html).not.toContain('tracker.test')
    expect(mail.html).toContain('#3b5998')
  })

  it('accepts the colour forms a theme actually stores', () => {
    for (const accent of ['#aa0044', 'rebeccapurple', 'oklch(0.6 0.2 250)', 'rgb(1, 2, 3)']) {
      expect(render({}, { accent }).html).toContain(accent)
    }
  })
})

describe('links', () => {
  it('makes a board-relative path absolute', () => {
    expect(render().text).toContain('https://board.example/notifications')
  })

  it('emits no link at all when the board has no configured origin', () => {
    const mail = render({}, { boardUrl: '' })
    expect(mail.text).not.toContain('/notifications')
    expect(mail.html).not.toContain('href=')
  })

  it('points at the preferences screen so a recipient can decline', () => {
    expect(render().text).toContain('https://board.example/notifications/preferences')
  })

  it('tolerates a trailing slash on the origin', () => {
    const mail = render({}, { boardUrl: 'https://board.example/' })
    expect(mail.text).toContain('https://board.example/notifications')
    expect(mail.text).not.toContain('example//notifications')
  })
})

describe('the message', () => {
  it('prefixes the subject with the board name', () => {
    expect(render().subject).toBe('[Test Board] You have been warned: Spamming')
  })

  it('names the board even when it has none configured', () => {
    expect(render({}, { boardName: '' }).subject).toBe('[the forum] You have been warned: Spamming')
  })

  it('produces a text part that stands on its own', () => {
    const mail = render()
    expect(mail.text).toContain('Hello ivan,')
    expect(mail.text).toContain('You have been warned: Spamming')
    expect(mail.text).toContain('Reason given: stop it')
  })

  it('splits the body into paragraphs rather than relying on pre-wrap', () => {
    const mail = render()
    expect(mail.html.match(/<p/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  it('omits the body block entirely when there is nothing to say', () => {
    const mail = render({ body: '' })
    expect(mail.text).toContain('You have been warned')
    expect(mail.html).not.toContain('<p style="margin:0 0 16px"></p>')
  })
})
