import type { Page } from '@playwright/test'

export async function openThreadTools(page: Page): Promise<void> {
  await page
    .getByRole('region', { name: /^(Moderator|Thread) tools$/ })
    .locator('summary')
    .click()
}
