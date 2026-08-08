/**
 * The default theme's online panel, and the one thing about it a shared
 * contract cannot check.
 *
 * `contract.test.ts` next door proves every theme renders a member and a count
 * from the same fixture. What it deliberately cannot assert is *how much* a
 * theme renders — that is the design choice the shared suite exists not to
 * flatten, and midnight's version of this panel is a single inline run with no
 * collapse at all.
 *
 * But the default theme's panel now sits in a rail beside the community listing,
 * and there it has a job the contract has no vocabulary for: **it has to stay
 * short on a board where a lot of people are reading.** A version that rendered
 * every name would pass every assertion over there and push the two panels
 * above it off the screen — which is exactly the failure that moved these into
 * a sidebar. So the boundary is pinned here: what shows, what hides, and that
 * hiding it costs no JavaScript.
 *
 * ## Why a theme's test lives in the app
 *
 * `react-dom` is where the themes are rendered, not where they are written:
 * `themes/*` declare React as a peer and pull in no renderer, which is what
 * keeps a theme a set of components rather than a program. The app is the tier
 * that renders them, so it is the tier that can assert on the markup — the same
 * reason `contract.test.ts` is here rather than in each theme.
 *
 * `createElement` rather than JSX because the suite collects `*.test.ts`, which
 * is also why that file is written this way.
 */
import { defaultTheme } from '@meith/theme-default'
import type { OnlineMemberModel, WhoIsOnlineModel } from '@meith/theme-kit'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/*
 * Reached through the manifest rather than imported from its module, so a
 * theme that wired a different component into this slot fails here too — which
 * is the one way the panel could be correct and the board still wrong.
 */
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
    /*
     * The off-by-one. A panel that collapsed at twelve would hide one name
     * behind a toggle reading "and 0 more", which is the version nobody
     * notices because it looks deliberate.
     */
    const html = render(12)

    expect(html).toContain('member12')
    expect(html).not.toContain('<details')
  })

  it('collapses the rest behind a native disclosure on a busy board', () => {
    const html = render(60)

    /* The first twelve are always there — this is a summary, not a toggle. */
    expect(html).toContain('member12')
    expect(html).toContain('<details')
    expect(html).toContain('48')

    /*
     * And the hidden names are **in the markup**, not fetched on demand. That
     * is what makes the collapse work with scripting off, and it is the whole
     * reason this is `<details>` rather than a button.
     */
    expect(html).toContain('member60')
  })

  it('ships no script to do it', () => {
    /*
     * The claim behind choosing `<details>` over anything else. A theme is a
     * server slot; an island here would be bytes on the board's most-requested
     * page, spent on hiding forty names.
     */
    expect(render(60)).not.toContain('<script')
  })

  it('never puts flow content inside a paragraph', () => {
    /*
     * A `<details>` inside a `<p>` is markup the browser's parser rewrites: it
     * closes the paragraph first, so the server's DOM and the browser's differ
     * and React reports a hydration mismatch — on the board's most-requested
     * page, for every reader on a board with more than twelve people on it.
     * Nothing else in the suite would catch it, because the string is correct.
     */
    const html = render(60)

    /*
     * `<p>` specifically, and not every phrasing element: it is the one whose
     * end tag the HTML parser *infers*. Meeting a `<details>` inside an open
     * paragraph closes the paragraph first, so the server's DOM and the
     * browser's differ and React reports a hydration mismatch — on the board's
     * most-requested page, for every reader on a board with more than twelve
     * people on it. Nothing else in the suite would catch it, because the
     * string React produced is correct.
     *
     * Every paragraph, not the first: an earlier version of this sliced to the
     * first `</p>` and was reading a different element entirely, which a
     * mutant walked straight through.
     */
    expect(html).toContain('<details')
    for (const [, inside] of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      expect(inside).not.toContain('<details')
    }
  })

  it('says what is happening when nobody is here, rather than showing nothing', () => {
    /*
     * "No members online" and "only guests are reading" are different facts and
     * lead to different conclusions about the board.
     */
    expect(render(0)).toContain('Only guests are reading the board right now.')
    expect(render(0, { guestCount: 0 })).toContain('Nobody is reading the board right now.')
  })

  it('marks an invisible member in words, wherever they fall in the run', () => {
    /*
     * Including past the fold: staff are the only readers who see these at all,
     * and a marker that stopped applying at the thirteenth name would be a
     * moderator believing somebody is visibly online.
     */
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
