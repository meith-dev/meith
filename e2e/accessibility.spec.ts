import { expect, test } from '@playwright/test'

test('the skip link is the first keyboard target and reaches the main landmark', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')

  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#board-content$/)
  await expect(page.locator('#board-content')).toBeFocused()
})

/**
 * A tab row must not be a vertical scroll container, and must not clip a focus
 * ring.
 *
 * Both were true of `ViewTabs` and neither was visible on a Mac, which is how
 * they lasted. `overflow-x-auto` makes an element a scroll container in *both*
 * axes — CSS resolves the paired `visible` to `auto` — so the one pixel each
 * tab's `-mb-px` puts past the content box drew a full-height scrollbar beside
 * two words on Windows and Linux, and the container clipped the 2px-offset
 * outline to two vertical ticks either side of a focused tab.
 *
 * Geometry, not appearance: a screenshot comparison would be a lie about what
 * broke, and neither fact is reachable from a unit test at all.
 */
test('a tab row scrolls sideways only, and gives a focus ring room to draw', async ({
  page,
}) => {
  await page.goto('/forum/100-announcements')

  /* Every tab row on the page, including the board sections above the forum. */
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label] ul')].map(
      (ul) => ul.scrollHeight - ul.clientHeight,
    ),
  )

  expect(overflow.length).toBeGreaterThan(0)
  expect(overflow).toEqual(overflow.map(() => 0))

  /*
   * Focused by keyboard rather than by `.focus()`, because `:focus-visible` is
   * the selector the outline hangs off and a script-driven focus does not
   * reliably match it — a test that measured an outline of zero width would
   * pass whatever the container clipped.
   */
  const tab = page.getByRole('link', { name: 'Top rated' })
  await tab.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(tab).toBeFocused()

  const ring = await tab.evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    const clip = element.closest('ul')!.getBoundingClientRect()

    return {
      /* What the outline needs beyond the item's own box, on each side. */
      reach: parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth),
      headroom: Math.min(box.top - clip.top, clip.bottom - box.bottom),
    }
  })

  expect(ring.reach).toBeGreaterThan(0)
  expect(ring.headroom).toBeGreaterThanOrEqual(ring.reach)
})
