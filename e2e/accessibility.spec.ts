import { expect, test } from '@playwright/test'

test('the skip link is the first keyboard target and reaches the main landmark', async ({
  page,
}) => {
  await page.goto('/')
  await page.keyboard.press('Tab')

  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#board-content$/)
  await expect(page.locator('#board-content')).toBeFocused()
})

test('a tab row scrolls sideways only, and gives a focus ring room to draw', async ({ page }) => {
  await page.goto('/100-announcements')

  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label] ul')].map(
      (ul) => ul.scrollHeight - ul.clientHeight,
    ),
  )

  expect(overflow.length).toBeGreaterThan(0)
  expect(overflow).toEqual(overflow.map(() => 0))

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
      reach: parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth),
      headroom: Math.min(box.top - clip.top, clip.bottom - box.bottom),
    }
  })

  expect(ring.reach).toBeGreaterThan(0)
  expect(ring.headroom).toBeGreaterThanOrEqual(ring.reach)
})

test('a failed login submit moves focus to the error alert', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill('e2e-nobody-with-this-name')
  await page.getByLabel('Password').fill('the-wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  const alert = page.getByRole('alert').filter({ hasText: 'Not saved' })
  await expect(alert).toBeVisible()
  await expect(alert).toBeFocused()
})
