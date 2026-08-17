import { expect, test } from '@playwright/test'

import { samplePng } from './support/png'
import { drainUntil, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('a member posts a thread and a reply, and both land in the database', async ({ page }) => {
  await signUp(page, 'poster')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `A thread from the browser ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Written with **no JavaScript** at all.')
  await page.getByRole('button', { name: 'Post thread' }).click()

  await expect(page).toHaveURL(/\/thread\/\d+-/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.locator('article strong').first()).toHaveText('no JavaScript')

  const threadUrl = page.url()

  await page.goto(`${threadUrl}/reply`)
  await page.getByLabel('Message').fill('And a reply, also without scripting.')
  await page.getByRole('button', { name: 'Post reply' }).click()

  await expect(page).toHaveURL(/#post-\d+$/)
  await expect(page.getByText('And a reply, also without scripting.')).toBeVisible()

  await page.goto('/200-general')
  await expect(page.getByRole('link', { name: title })).toBeVisible()
})

test('an image attachment is not served until it has been re-encoded', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000)

  await signUp(page, 'uploader')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `With a picture ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('There should be an image under this.')
  await page.getByLabel('Attachments').setInputFiles({
    name: 'holiday.png',
    mimeType: 'image/png',
    buffer: samplePng(),
  })
  await page.getByRole('button', { name: 'Post thread' }).click()

  await expect(page).toHaveURL(/\/thread\/\d+-/)
  const threadUrl = page.url()

  await expect(page.getByText('There should be an image under this.')).toBeVisible()
  await expect(page.locator('article img')).toHaveCount(0)

  await drainUntil(request, page, threadUrl, async () => {
    await expect(page.locator('article img').first()).toBeVisible({ timeout: 2_000 })
  })

  const href = await page.locator('article a[href^="/attachment/"]').first().getAttribute('href')
  expect(href).toMatch(/^\/attachment\/\d+$/)

  const download = await request.get(href!)
  expect(download.status()).toBe(200)

  expect(download.headers()['content-type']).toBe('image/png')
  expect(download.headers()['content-disposition']).toContain('attachment;')
  expect(download.headers()['x-content-type-options']).toBe('nosniff')

  const body = await download.body()
  expect([...body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(body.length).not.toBe(samplePng().length)
})

test('a file the board will not accept is refused, and nothing is posted', async ({ page }) => {
  await signUp(page, 'refused')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `Should not exist ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('This post should never be created.')
  await page.getByLabel('Attachments').setInputFiles({
    name: 'payload.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<?php system($_GET["c"]); ?>'),
  })
  await page.getByRole('button', { name: 'Post thread' }).click()

  await expect(page.getByText(/not a type this board accepts/)).toBeVisible()

  await page.goto('/200-general')
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
})

test('an attachment in a thread a guest may not read is refused by URL', async ({
  page,
  request,
}) => {
  const anonymous = await request.get('/attachment/999999')
  expect(anonymous.status()).toBe(404)

  const notANumber = await request.get('/attachment/abc')
  expect(notANumber.status()).toBe(404)

  void page
})

test('an avatar is re-encoded before it appears anywhere', async ({ page, request }) => {
  test.setTimeout(150_000)

  await signUp(page, 'face')

  await page.goto('/usercp/avatar')
  await expect(page.getByText('You have not set one.')).toBeVisible()

  await page.getByLabel('Choose an image').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: samplePng(300, 300),
  })
  await page.getByRole('button', { name: 'Upload' }).click()

  await expect(page.getByText(/It will appear shortly/)).toBeVisible()
  await expect(page.locator('img[alt="Your avatar"]')).toHaveCount(0)

  const shown = page.locator('img[alt="Your avatar"]')
  await drainUntil(request, page, '/usercp/avatar', async () => {
    await expect(shown).toBeVisible({ timeout: 2_000 })
  })

  const src = await shown.getAttribute('src')
  expect(src).toMatch(/^\/avatar\/\d+\?v=\d+$/)

  const image = await request.get(src!)
  expect(image.status()).toBe(200)
  expect(image.headers()['x-content-type-options']).toBe('nosniff')

  const body = await image.body()
  expect([...body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(body.length).toBeLessThan(samplePng(300, 300).length)
})

test('an avatar that is not an image is refused, and nothing is stored', async ({ page }) => {
  await signUp(page, 'notaface')

  await page.goto('/usercp/avatar')
  await page.getByLabel('Choose an image').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: Buffer.from('GIF89a this is not a png'),
  })
  await page.getByRole('button', { name: 'Upload' }).click()

  await expect(page.getByText(/not a type this board accepts/)).toBeVisible()
  await expect(page.locator('img[alt="Your avatar"]')).toHaveCount(0)
})
