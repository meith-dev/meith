import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test('the poll composer appends option rows client-side, with JavaScript on', async ({ page }) => {
  await signUp(page, 'jspollauthor')
  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  const title = `Which toppings? ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Pick your favourites.')
  await page.getByText('Add a poll').click()
  await page.getByLabel('Question').fill('Which toppings?')
  await page.getByLabel('Option 1').fill('Pepperoni')
  await page.getByLabel('Option 2').fill('Mushroom')
  await page.getByLabel('Option 3').fill('Olives')
  await page.getByLabel('Option 4').fill('Pineapple')

  const beforeUrl = page.url()
  await page.getByRole('button', { name: 'More options' }).click()
  await expect(page.getByLabel('Option 8')).toBeVisible()
  expect(page.url()).toBe(beforeUrl)
  await expect(page.getByLabel('Option 1')).toHaveValue('Pepperoni')
  await expect(page.getByLabel('Question')).toHaveValue('Which toppings?')

  await page.getByLabel('Option 5').fill('Anchovies')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  const poll = page.getByRole('region', { name: 'Poll' })
  await expect(poll.getByText('Anchovies (0)')).toBeVisible()
})
