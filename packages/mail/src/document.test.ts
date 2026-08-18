import { describe, expect, it } from 'vitest'

import { sourceTranslator } from '@meith/i18n'

import { buildMailBrand, type MailBrand } from './brand'
import { type MailBody, renderMail, safeHref } from './document'

const CATALOG = {
  'mail.action.fallback': 'If the button does not work, open this address in your browser:',
  'mail.boardFallback': 'the forum',
}

const t = sourceTranslator(CATALOG)

const BRAND: MailBrand = buildMailBrand({
  boardName: 'The Townland',
  boardUrl: 'https://board.example',
  tokens: null,
})

const BODY: MailBody = {
  title: 'Confirm your account',
  greeting: 'Hello ada,',
  paragraphs: ['An account was created for this address.', 'If this was not you, ignore it.'],
  action: { label: 'Confirm your address', href: 'https://board.example/verify?token=abc' },
  note: 'The link is valid for 24 hours.',
  footer: [{ text: 'Sent by The Townland.' }],
}

function render(body: Partial<MailBody> = {}, brand: Partial<MailBrand> = {}) {
  return renderMail({ brand: { ...BRAND, ...brand }, body: { ...BODY, ...body }, t })
}

describe('the document', () => {
  it('is a complete HTML document, not a bare div', () => {
    const html = render().html
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
    expect(html).toContain('<meta name="color-scheme" content="light dark">')
  })

  it('lays out on tables, which is the only layout every client agrees on', () => {
    expect(render().html).toContain('<table role="presentation"')
  })

  it('carries a dark palette behind prefers-color-scheme', () => {
    const html = render().html
    expect(html).toContain('@media (prefers-color-scheme:dark)')
    expect(html).toContain(BRAND.palette.dark.card)
  })

  it('prefixes the subject with the board name', () => {
    expect(render().subject).toBe('[The Townland] Confirm your account')
  })

  it('names the board even when it has none configured', () => {
    expect(render({}, { boardName: '' }).subject).toBe('[the forum] Confirm your account')
  })
})

describe('the action', () => {
  it('renders a button and the address behind it', () => {
    const html = render().html
    expect(html).toContain('Confirm your address')
    expect(html).toContain('https://board.example/verify?token=abc')
    expect(html).toContain(CATALOG['mail.action.fallback'])
  })

  it('puts the address in the text part on one readable line', () => {
    expect(render().text).toContain('Confirm your address: https://board.example/verify?token=abc')
  })

  it('drops an action whose address is not an http one', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,x', '/relative', '']) {
      const mail = render({ action: { label: 'Go', href } })
      expect(mail.html, href).not.toContain('Go</a>')
      expect(mail.text, href).not.toContain('Go:')
    }
  })
})

describe('the footer', () => {
  it('links a line that has an address and states it plainly in the text part', () => {
    const mail = render({
      footer: [
        { text: 'You have an account on The Townland.' },
        { text: 'Change which e-mails you receive', href: 'https://board.example/prefs' },
      ],
    })

    expect(mail.html).toContain('href="https://board.example/prefs"')
    expect(mail.text).toContain('Change which e-mails you receive: https://board.example/prefs')
  })

  it('is left out entirely when there is nothing to say', () => {
    expect(render({ footer: [] }).html).not.toContain('class="m-foot')
  })
})

describe('the masthead', () => {
  it('is the board name when no logo is configured', () => {
    expect(render().html).toContain('class="m-wordmark"')
  })

  it('is the logo when one is, with the board name as its alt text', () => {
    const branded = buildMailBrand({
      boardName: 'The Townland',
      boardUrl: 'https://board.example',
      tokens: null,
      logo: {
        lightKey: 'board/logo-light-11111111-1111-1111-1111-111111111111.png',
        darkKey: 'board/logo-dark-22222222-2222-2222-2222-222222222222.png',
        alt: 'The Townland',
      },
    })

    const html = render({}, branded).html
    expect(html).toContain('<img src="https://board.example/logo/light?v=')
    expect(html).toContain('<img src="https://board.example/logo/dark?v=')
    expect(html).toContain('alt="The Townland"')
    expect(html).not.toContain('class="m-wordmark"')
  })

  it('links the masthead home when the board has an address', () => {
    expect(render().html).toContain('<a href="https://board.example"')
    expect(render({}, { boardUrl: '' }).html).not.toContain('<a href="https://board.example"')
  })

  it('never emits a double quote inside a style attribute', () => {
    for (const declaration of render().html.matchAll(/style="([^"]*)"/g)) {
      expect(declaration[1]).not.toContain('"')
    }
    expect(render().html).not.toContain('style="" ')
  })
})

describe('safeHref', () => {
  it('passes only absolute http addresses', () => {
    expect(safeHref('https://board.example/x?y=1')).toBe('https://board.example/x?y=1')
    expect(safeHref('http://board.example')).toBe('http://board.example')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('//board.example')).toBeNull()
    expect(safeHref(null)).toBeNull()
  })
})
