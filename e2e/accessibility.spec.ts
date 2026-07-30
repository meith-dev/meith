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
