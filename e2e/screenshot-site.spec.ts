import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { type BrowserContext, expect, type Page, test } from '@playwright/test'

import { SCHEME_COOKIE, THEME_COOKIE } from '../apps/community/src/view/theme-preference'
import { FIXTURE_BASE_URL } from './support/config'

function shotsDirectory(): string {
  return path.resolve(test.info().config.rootDir, '../apps/web/public/shots')
}

const DESKTOP = { width: 1280, height: 820 }
const PHONE = { width: 390, height: 780 }
const SCALE = 2

const THEMES = ['default', 'clubhouse', 'midnight', 'phasebook', 'raidframe'] as const

const SCHEMES = ['light', 'dark'] as const

const RECENT_THREADS = '/200-general'
const THREAD_LINK = 'a[href^="/thread/"]'

const HIDE_DEV_CHROME = `
  nextjs-portal { display: none !important }
`

async function shoot(page: Page, name: string, directory = shotsDirectory()): Promise<void> {
  await page.addStyleTag({ content: HIDE_DEV_CHROME })

  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(page.getByRole('banner')).toBeInViewport()
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'disabled' })
}

async function paint(
  context: BrowserContext,
  page: Page,
  options: { theme?: string; scheme?: 'light' | 'dark' },
  at?: string,
): Promise<void> {
  const scope = { domain: new URL(FIXTURE_BASE_URL).hostname, path: '/' } as const

  const cookies = []
  if (options.theme !== undefined) {
    cookies.push({ name: THEME_COOKIE, value: options.theme, ...scope })
  }
  if (options.scheme !== undefined) {
    cookies.push({ name: SCHEME_COOKIE, value: options.scheme, ...scope })
  }

  await context.addCookies(cookies)

  if (at === undefined) await page.reload()
  else await page.goto(at)
}

test('the marketing site, photographed', async ({ browser }) => {
  mkdirSync(shotsDirectory(), { recursive: true })

  const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: SCALE })
  const page = await desktop.newPage()

  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Noticeboard' }).first()).toBeVisible()

  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      await paint(desktop, page, { theme, scheme })
      await shoot(page, `theme-${theme}-${scheme}`)
    }
  }

  await desktop.close()

  const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE })
  const phonePage = await phone.newPage()

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

test('the marketplace, photographed', async ({ browser }) => {
  const directory = path.resolve(test.info().config.rootDir, '../marketplace/screenshots')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    javaScriptEnabled: true,
    colorScheme: 'light',
  })
  context.setDefaultTimeout(15_000)
  try {
    const page = await context.newPage()

    for (const theme of THEMES) {
      await paint(context, page, { theme, scheme: 'light' }, '/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(
        page.getByRole('link', { name: 'Noticeboard', exact: true }).first(),
      ).toBeVisible()
      await shoot(page, `${theme}-light`, directory)
    }
  } finally {
    await context.close()
  }
})
