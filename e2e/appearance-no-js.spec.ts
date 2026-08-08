import { expect, test, type Page } from '@playwright/test'

/**
 * The appearance controls, driven the way a browser drives them.
 *
 * Everything here is provable only in a browser, which is why it is an e2e spec
 * rather than a unit test:
 *
 *  - a **theme** choice changes the markup, not merely the colours — `midnight`
 *    renders community listings as a `<table>` and the default renders a list, so
 *    counting tables is the difference between a real switch and a repaint;
 *  - the choice **survives a reload**, because it is a cookie the server reads
 *    rather than something a script re-applies after the page has painted;
 *  - pressing a colour-scheme button **does not touch the theme**. That one is
 *    here because it was a real bug: the two controls started life in one
 *    `<form>`, a `<select name="theme">` posts its current value from any
 *    submit button in the same form, and so "Dark" quietly pinned the member's
 *    theme as a side effect. Every unit test passed — the cookie written was
 *    valid and was the value on screen. Only reading `document.cookie` in a
 *    browser showed it.
 *
 * With scripting off throughout, which is the harder case and the one the
 * board promises (D06). If these pass here they pass with React hydrating too.
 */
test.use({ javaScriptEnabled: false })

/** `midnight` renders listings as tables; the default theme does not. */
const listingTables = (page: Page) => page.locator('table').count()

async function cookies(page: Page) {
  const jar = await page.context().cookies()
  return Object.fromEntries(jar.map((cookie) => [cookie.name, cookie.value]))
}

test('a member switches theme and colour scheme without JavaScript', async ({ page }) => {
  await page.goto('/')

  const strip = page.getByRole('region', { name: 'Appearance' })
  await expect(strip).toBeVisible()

  /* The board default: no cookie, no forced scheme, the default theme's markup. */
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'default')
  expect(await listingTables(page)).toBe(0)

  await strip.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

  /*
   * The regression check. A scheme press must write a scheme and nothing else —
   * the theme menu is a separate form for exactly this reason.
   */
  expect(await cookies(page)).not.toHaveProperty('meith_theme')

  await strip.getByLabel('Theme').selectOption('midnight')
  await strip.getByRole('button', { name: 'Apply' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  /* The layout changed, not just the palette. */
  expect(await listingTables(page)).toBeGreaterThan(0)
  /* And the scheme the member chose a moment ago is still in force. */
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  expect(await listingTables(page)).toBeGreaterThan(0)

  /*
   * Back to following the operating system. `system` is stored as an answer
   * rather than as the absence of one, so that a member who chose it is not
   * moved the next time an administrator changes the board default.
   */
  await strip.getByRole('button', { name: 'System', exact: true }).click()
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)(dark|light)(\s|$)/)
  expect((await cookies(page)).meith_scheme).toBe('system')
})

test('a theme an administrator turns off stops rendering for the member who chose it', async ({
  page,
  context,
}) => {
  /*
   * Written straight into the jar rather than through the control, because the
   * case being proved is the one the control cannot reach: a cookie that was
   * valid when it was set and is not any more. The reader validates against the
   * *enabled* list on every request, so nobody has to clear a cookie for an
   * administrator's decision to take effect.
   *
   * `not-installed` stands in for a theme that has been removed from the build
   * entirely, which is the same class of stale value.
   */
  await context.addCookies([
    { name: 'meith_theme', value: 'not-installed', url: 'http://127.0.0.1:3001' },
  ])

  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'default')
  expect(await listingTables(page)).toBe(0)
})
