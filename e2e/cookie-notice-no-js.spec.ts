import { expect, test } from '@playwright/test'

/**
 * The cookie notice: where it sits, what it says, and that both answers work.
 *
 * ## Why this exists as its own spec
 *
 * The notice had no coverage of its own. What it had instead was a *symptom* —
 * `writing-no-js` failing to click "Post reply" — which is how both of its
 * position bugs were found, and which is a terrible way to learn about a banner.
 * A failure over there says a button is unclickable; it does not say the notice
 * is in the wrong place, and the second time it happened the first fix had
 * already been written down and forgotten.
 *
 * So the placement is asserted where the notice is, and the specs that write to
 * the board answer the question first, the way a member does.
 *
 * ## No scripting, again
 *
 * The whole control is a `<form>` with two submit buttons and a `<details>`.
 * Nothing here needs JavaScript and nothing here may: consent that can only be
 * refused by a browser running scripts is not freely given.
 */
test.use({ javaScriptEnabled: false })

const NOTICE = 'complementary'

test('it rides the foot of the viewport without covering the page', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 })
  await page.goto('/')

  const notice = page.getByRole(NOTICE, { name: 'Cookies' })
  await expect(notice).toBeVisible()

  /*
   * Sticky, not fixed. The distinction is the whole design: a sticky element
   * stays in flow and owns space at the end of the document, so the page can
   * always be scrolled clear of it. `fixed` is what covered the reply button.
   */
  await expect(notice).toHaveCSS('position', 'sticky')

  /* Pinned to the foot of the viewport before any scrolling has happened. */
  const atTop = await notice.boundingBox()
  expect(atTop).not.toBeNull()
  expect(atTop!.y + atTop!.height).toBeLessThanOrEqual(700 + 1)

  /*
   * And still pinned after scrolling — which is what "sticky to the bottom of
   * the screen" means, and what an in-flow notice at the end of the document
   * does not do.
   */
  await page.mouse.wheel(0, 400)
  const scrolled = await notice.boundingBox()
  expect(scrolled).not.toBeNull()
  expect(scrolled!.y + scrolled!.height).toBeLessThanOrEqual(700 + 1)

  /*
   * The reserve. The page's own content has to end above the bar, or the bar is
   * sitting on whatever came last — which on this board is the appearance strip
   * on every single page.
   */
  const reserved = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.body).paddingBottom),
  )
  expect(reserved).toBeGreaterThan(0)
})

test('it asks a generic question, with the detail one click away', async ({ page }) => {
  await page.goto('/')
  const notice = page.getByRole(NOTICE, { name: 'Cookies' })

  /*
   * The headline says the site needs cookies and asks about the optional ones.
   * It does *not* enumerate them: that is the half people skip and the half that
   * goes stale.
   */
  await expect(notice.getByText(/uses cookies so that it works correctly/i)).toBeVisible()

  /*
   * The specifics are still reachable, because consent has to be informed to be
   * consent. Collapsed, so nobody has to read them.
   */
  const detail = notice.getByRole('group')
  await expect(detail).not.toHaveAttribute('open', '')
  await expect(notice.getByText('What is stored')).toBeVisible()
})

test('refusing is offered first, and is exactly as easy as allowing', async ({ page }) => {
  await page.goto('/')
  const notice = page.getByRole(NOTICE, { name: 'Cookies' })

  /*
   * Reading order is part of how hard something is. Consent is not freely given
   * if saying no is the harder of the two, so "No thanks" comes first and both
   * are one press of an identically-sized control.
   */
  const buttons = notice.getByRole('button')
  await expect(buttons).toHaveCount(2)
  await expect(buttons.nth(0)).toHaveText('No thanks')
  await expect(buttons.nth(1)).toHaveText('Allow')

  const no = await buttons.nth(0).boundingBox()
  const yes = await buttons.nth(1).boundingBox()
  expect(no!.width).toBeCloseTo(yes!.width, 0)
  expect(no!.height).toBeCloseTo(yes!.height, 0)
})

test('answering it puts it away, and leaves a way to change your mind', async ({ page }) => {
  await page.goto('/')
  await page.getByRole(NOTICE, { name: 'Cookies' }).getByRole('button', { name: 'No thanks' }).click()

  /* Gone, and with it the space the page was reserving for it. */
  await expect(page.getByRole(NOTICE, { name: 'Cookies' })).toHaveCount(0)
  const reserved = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.body).paddingBottom),
  )
  expect(reserved).toBe(0)

  /*
   * Withdrawing has to be as easy as giving, and a notice that vanishes when
   * answered leaves nowhere to change your mind. The preferences strip is that
   * somewhere — and it reports the current answer rather than just offering a
   * toggle with no state.
   */
  const toggle = page.getByRole('region', { name: 'Privacy' }).getByRole('button')
  await expect(toggle).toHaveText('Off')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  await toggle.click()
  const after = page.getByRole('region', { name: 'Privacy' }).getByRole('button')
  await expect(after).toHaveText('Allowed')
  await expect(after).toHaveAttribute('aria-pressed', 'true')
})
