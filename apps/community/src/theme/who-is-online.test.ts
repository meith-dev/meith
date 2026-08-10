import { defaultTheme } from '@meith/theme-default'
import type { OnlineMemberModel, WhoIsOnlineModel } from '@meith/theme-kit'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

const WhoIsOnline = defaultTheme.slots.WhoIsOnline as (props: WhoIsOnlineModel) => ReactNode

const member = (id: number): OnlineMemberModel => ({
  userId: id,
  username: `member${id}`,
  profileHref: `/member/${id}`,
  nameClass: null,
  location: { label: 'Somewhere on the board', href: null },
  isInvisible: false,
  lastSeen: { iso: '2026-05-05T11:58:00.000Z', label: 'Today, 11:58' },
})

function render(count: number, overrides: Partial<WhoIsOnlineModel> = {}): string {
  const members = Array.from({ length: count }, (_, index) => member(index + 1))
  return renderToStaticMarkup(
    createElement(WhoIsOnline, {
      guestCount: 2,
      members,
      total: count + 2,
      recordCount: 40,
      recordAt: { iso: '2025-11-01T20:00:00.000Z', label: '1 Nov 2025, 20:00' },
      fullListHref: '/online',
      ...overrides,
    }),
  )
}

describe('the collapse', () => {
  it('shows a quiet board whole, with no toggle at all', () => {
    const html = render(5)

    expect(html).toContain('member5')
    expect(html).not.toContain('<details')
  })

  it('shows every name on a board sitting exactly on the boundary', () => {
    const html = render(12)

    expect(html).toContain('member12')
    expect(html).not.toContain('<details')
  })

  it('collapses the rest behind a native disclosure on a busy board', () => {
    const html = render(60)

    expect(html).toContain('member12')
    expect(html).toContain('<details')
    expect(html).toContain('48')

    expect(html).toContain('member60')
  })

  it('ships no script to do it', () => {
    expect(render(60)).not.toContain('<script')
  })

  it('never puts flow content inside a paragraph', () => {
    const html = render(60)

    expect(html).toContain('<details')
    for (const [, inside] of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      expect(inside).not.toContain('<details')
    }
  })

  it('says what is happening when nobody is here, rather than showing nothing', () => {
    expect(render(0)).toContain('Only guests are reading the board right now.')
    expect(render(0, { guestCount: 0 })).toContain('Nobody is reading the board right now.')
  })

  it('marks an invisible member in words, wherever they fall in the run', () => {
    const members = Array.from({ length: 20 }, (_, index) => ({
      ...member(index + 1),
      isInvisible: index === 15,
    }))

    const html = renderToStaticMarkup(
      createElement(WhoIsOnline, {
        guestCount: 0,
        members,
        total: 20,
        recordCount: 40,
        recordAt: null,
        fullListHref: '/online',
      }),
    )

    expect(html.indexOf('Invisible')).toBeGreaterThan(html.indexOf('<details'))
  })
})
