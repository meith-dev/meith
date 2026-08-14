import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'

import { SCHEME_COOKIE, THEME_COOKIE } from '../apps/community/src/view/theme-preference'

/*
 * The photographs the marketing site is built out of.
 *
 * Run by `pnpm site:shots`, against the demo board rather than the fixture —
 * see `e2e/screenshot-site.config.ts` for why that is a config of its own.
 *
 * This is not a test. It asserts only enough to fail loudly rather than
 * quietly photograph the wrong thing: an empty board, a theme that did not take,
 * a search that returned nothing because the index had not been built. A shot
 * of a board with no posts in it is worse than no shot at all, because nobody
 * notices until it is on the front page.
 *
 * The names are the contract. `apps/web/app/page.tsx` and the segment route
 * reference these files by name, so renaming one here breaks an image there.
 */

/*
 * Resolved from Playwright's own root rather than from `import.meta`, which the
 * spec loader compiles away, or from the working directory, which is whatever
 * the person running it happened to be standing in.
 */
function shotsDirectory(): string {
  return path.resolve(test.info().config.rootDir, '../apps/web/public/shots')
}

const TICK_SECRET = 'shots-only-tick-secret-0000000000'

/*
 * Wide enough that the board is laid out the way a desktop reader sees it, and
 * short enough that the crop is a picture rather than a scroll. Doubled, because
 * the site is looked at on the screens that make an unscaled PNG look soft.
 */
const DESKTOP = { width: 1280, height: 820 }
const PHONE = { width: 390, height: 780 }
const SCALE = 2

/*
 * Every theme this repository ships, in the order the site shows them. `default`
 * leads because it is what an unconfigured board looks like, and the other four
 * are the argument that it does not have to.
 *
 * Each is photographed in both colour schemes. A theme is a pair of token sets,
 * not one — a colour that reads on paper-white disappears at midnight, and the
 * themes are built with both in mind. Showing one scheme would be showing half
 * of each theme, and the half a given reader is not looking at.
 */
const THEMES = ['default', 'clubhouse', 'midnight', 'phasebook', 'raidframe'] as const

const SCHEMES = ['light', 'dark'] as const

/*
 * Threads are reached by walking to them rather than by address. Forum and
 * thread URLs carry the row's id ahead of its slug, so a path written out here
 * would be a guess about what the seed numbered things — and a wrong guess is a
 * 404 that photographs as an empty page.
 */
const RECENT_THREADS = '/discover/new'
const THREAD_LINK = 'a[href^="/thread/"]'

/* Matched across several forums by the demo seed. If it stops matching, the
 * search shot would be a page reading "nothing matched", so it is asserted. */
const SEARCH_TERM = 'training'

/*
 * Two things that belong on demo.meith.dev and on no marketing page.
 *
 * The demo strip tells a visitor how to log in, which in a screenshot on the
 * front page reads as a security hole rather than an invitation. The dev
 * server's own overlay is not part of the product at all. Both are hidden
 * rather than turned off, because turning either off means booting a board that
 * is not the one being sold.
 */
const HIDE_DEV_CHROME = `
  aside[aria-label="About this demo"] { display: none !important }
  nextjs-portal { display: none !important }
`

async function shoot(page: Page, name: string): Promise<void> {
  await page.addStyleTag({ content: HIDE_DEV_CHROME })

  /*
   * Asserted rather than trusted. The published logins are the one thing on
   * this board that must never reach a marketing page, and a selector that
   * stops matching — because the strip was renamed, or given a different
   * label — would otherwise fail silently and put "admin / admin" on the front
   * page. A shot is worth failing the run over.
   */
  await expect(page.locator('aside[aria-label="About this demo"]')).toBeHidden()

  // Not `networkidle`: the dev server holds a hot-reload channel open, so the
  // network never goes idle and the wait would spend its whole timeout. The
  // board paints from a server-read cookie and there is no repaint to wait for,
  // so settling the fonts is all that is left.
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(shotsDirectory(), `${name}.png`) })
}

async function paint(
  context: BrowserContext,
  page: Page,
  options: { theme?: string; scheme?: 'light' | 'dark' },
): Promise<void> {
  const cookies = []
  if (options.theme !== undefined) {
    cookies.push({ name: THEME_COOKIE, value: options.theme, url: page.url() })
  }
  if (options.scheme !== undefined) {
    cookies.push({ name: SCHEME_COOKIE, value: options.scheme, url: page.url() })
  }

  await context.addCookies(cookies)
  await page.reload()
}

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
}

/*
 * A freshly seeded board has done none of its background work: nothing is
 * indexed for search, and the counters behind every theme's statistics panel
 * are all zero — Raidframe and Midnight both render that as "not counted yet"
 * beside three noughts, in the sidebar, in shot after shot.
 *
 * So the scheduler is driven until the board looks like one that has been up
 * for a while, which is what it is pretending to be. Search is the slowest of
 * the tasks to come good, so it is what the loop waits on; the counters and the
 * statistics roll up on the same ticks.
 */
async function warmTheBoard(request: APIRequestContext, page: Page): Promise<void> {
  await expect(async () => {
    await request.get(`/api/system/tick?secret=${TICK_SECRET}`)
    await page.goto(`/search?q=${SEARCH_TERM}`)
    await expect(page.getByRole('link').filter({ hasText: /\w/ }).first()).toBeVisible()
    await expect(page.getByText('Nothing matched')).toBeHidden()
  }).toPass({ timeout: 120_000, intervals: [1_000, 2_000, 5_000, 10_000] })
}

test('the marketing site, photographed', async ({ browser, request }) => {
  rmSync(shotsDirectory(), { recursive: true, force: true })
  mkdirSync(shotsDirectory(), { recursive: true })

  const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE })
  const page = await desktop.newPage()

  /*
   * Photographed as an ordinary member rather than as the administrator, for
   * one reason that outweighs the richer board an administrator is shown: the
   * seed holds a spam thread in the moderation queue on purpose, and an
   * administrator can see unapproved content. Photographed as `admin`, the
   * board's own "Latest threads" panel leads on *cheap replica jerseys all
   * clubs best price fast shipping*.
   *
   * A member sees what a visitor sees, which is the honest thing to photograph
   * anyway.
   */
  await signIn(page, 'member', 'member')

  await warmTheBoard(request, page)

  /*
   * The tick above runs whatever the scheduler thinks is due, and on a demo
   * board one of those things drops the schema. `demo-board.ts` stamps the
   * reset as just-run so it is not due; this is the assertion that says so. A
   * board that reset underneath us signs the reader out, and every shot from
   * here on would be a stranger's view of a board a few seconds old.
   */
  await expect(page.getByRole('button', { name: 'Your account' })).toBeVisible()

  await page.goto('/')

  // `.first()` because the name matches twice: the forum in the tree, and the
  // forum it is named after in the "latest posts" panel beside it.
  await expect(page.getByRole('link', { name: 'Noticeboard' }).first()).toBeVisible()

  /*
   * 1 and 5 together — what a board is, and that it can look like five
   * different things. Ten shots of one board on one afternoon, which is the
   * only honest way to photograph a theme.
   *
   * The default theme's pair does double duty as the hero, so there is no
   * separate `board-light` — it would be the same pixels under another name,
   * and two files that must never disagree are one file too many.
   */
  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      await paint(desktop, page, { theme, scheme })
      await shoot(page, `theme-${theme}-${scheme}`)
    }
  }

  await paint(desktop, page, { theme: 'default' })

  /*
   * 3 and 4 — search, and nothing ranking it for you.
   *
   * In both schemes, as everything below is. A light screenshot on a dark page
   * is the tell that the picture was taken somewhere else, and this site has a
   * colour-scheme toggle in its header — so every shot it shows needs a partner
   * for the other side of it.
   */
  await page.goto(`/search?q=${SEARCH_TERM}`)
  await expect(page.getByText('Nothing matched')).toBeHidden()

  for (const scheme of SCHEMES) {
    await paint(desktop, page, { scheme })
    await shoot(page, `search-${scheme}`)
  }

  // 7 — memberships, as a visitor who has not bought one meets them.
  const guest = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE })
  const guestPage = await guest.newPage()
  await guestPage.goto('/plugins/dues')
  await expect(guestPage.getByRole('heading', { level: 1 })).toBeVisible()

  for (const scheme of SCHEMES) {
    await paint(guest, guestPage, { scheme })
    await shoot(guestPage, `dues-${scheme}`)
  }

  await guest.close()
  await desktop.close()

  /*
   * 2 — a phone, to stand in front of the desktop shot in the hero. No copy goes
   * anywhere near it; the point of the picture is that it needs none.
   *
   * A thread rather than the forum index, because the desktop shot beside it is
   * already the index — the pair is then the two halves of what a board is for:
   * finding the conversation, and having it.
   */
  const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE })
  const phonePage = await phone.newPage()

  await signIn(phonePage, 'member', 'member')

  await phonePage.goto(RECENT_THREADS)
  const phoneThread = phonePage.locator(THREAD_LINK).first()
  await expect(phoneThread).toBeVisible()
  await phoneThread.click()
  await expect(phonePage).toHaveURL(/\/thread\//)

  for (const scheme of SCHEMES) {
    await paint(phone, phonePage, { theme: 'default', scheme })
    await shoot(phonePage, `thread-mobile-${scheme}`)
  }

  await phone.close()
})
