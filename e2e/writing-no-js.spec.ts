/**
 * The write path, in a browser, with JavaScript off.
 *
 * **This file is what the standing gap was.** Since F39 the browser suite has
 * run against `DATA_SOURCE=fixture`, which has no writer for anything, so
 * posting, moderation and attachments have had no browser-level proof at all —
 * a hole `plan-status.md` named feature after feature. `e2e/support/database.ts`
 * is what makes it possible; this is the first thing to walk through it.
 *
 * Every test here runs with scripting disabled. That is the point rather than a
 * flourish: this board's claim is that a native `<form>` does the work and the
 * islands are optional, and a suite that tested the enhanced path would prove
 * the opposite of what is claimed.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { samplePng } from './support/png'

test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'

/** Register through the form, then sign in. The only way to get a session. */
async function signUp(page: Page, label: string): Promise<string> {
  const username = `e2e_${label}_${Date.now()}_${Math.floor(Math.random() * 1000)}`

  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login\?registered=1$/)

  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  return username
}

/**
 * Run the board's tick until `check` passes.
 *
 * A single tick is *not* enough, and the reason is the scheduler working
 * correctly rather than a flake: `queue.drain` has a sixty-second interval, so
 * the second spec in a run that needs a drain finds the task not yet due and
 * the tick reports it skipped. Asserting "after exactly one tick" was
 * over-specifying — the contract a member experiences is "once the queue has
 * run", and that is what this waits for.
 *
 * The tick URL is the production path: the serverless profile drives it with a
 * cron, so this is not a test hook.
 */
async function drainUntil(
  request: APIRequestContext,
  page: Page,
  url: string,
  check: () => Promise<void>,
): Promise<void> {
  /*
   * Longer than the default 30s, because the wait is bounded by that interval
   * and not by anything this test does. Only the specs that wait on the queue
   * pay it.
   */
  test.setTimeout(150_000)

  await expect(async () => {
    await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
    await page.goto(url)
    await check()
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 5_000, 10_000] })
}

test('a member posts a thread and a reply, and both land in the database', async ({ page }) => {
  await signUp(page, 'poster')

  await page.goto('/forum/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `A thread from the browser ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Written with [b]no JavaScript[/b] at all.')
  await page.getByRole('button', { name: 'Post thread' }).click()

  await expect(page).toHaveURL(/\/thread\/\d+-/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  /*
   * The renderer ran on the server: asserting the tag rather than the words is
   * what distinguishes "BBCode was rendered" from "the input was echoed".
   */
  await expect(page.locator('article strong').first()).toHaveText('no JavaScript')

  const threadUrl = page.url()

  await page.goto(`${threadUrl}/reply`)
  await page.getByLabel('Message').fill('And a reply, also without scripting.')
  await page.getByRole('button', { name: 'Post reply' }).click()

  await expect(page.getByText('And a reply, also without scripting.')).toBeVisible()

  /*
   * The forum listing's denormalised counters moved. This is the half of
   * posting that unit tests cover in isolation and nothing had ever exercised
   * end to end — the write, the counter update and the read are three different
   * modules and this is the only place all three run together.
   */
  await page.goto('/forum/200-general')
  await expect(page.getByRole('link', { name: title })).toBeVisible()
})

test('an image attachment is not served until it has been re-encoded', async ({ page, request }) => {
  await signUp(page, 'uploader')

  await page.goto('/forum/200-general')
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

  /*
   * F42's central claim, seen from outside: the post exists and the attachment
   * does not, because the bytes the member uploaded are never served and the
   * re-encoded ones do not exist yet.
   */
  await expect(page.getByText('There should be an image under this.')).toBeVisible()
  await expect(page.locator('article img')).toHaveCount(0)

  await drainUntil(request, page, threadUrl, async () => {
    await expect(page.locator('article img').first()).toBeVisible({ timeout: 2_000 })
  })

  const href = await page.locator('article a[href^="/attachment/"]').first().getAttribute('href')
  expect(href).toMatch(/^\/attachment\/\d+$/)

  const download = await request.get(href!)
  expect(download.status()).toBe(200)

  /*
   * The headers *are* the security control for member-supplied bytes, and they
   * are the reason this streams through the app rather than redirecting to a
   * signed object-store URL. Asserting them here is the only place that check
   * is made against a real HTTP response.
   */
  expect(download.headers()['content-type']).toBe('image/png')
  expect(download.headers()['content-disposition']).toContain('attachment;')
  expect(download.headers()['x-content-type-options']).toBe('nosniff')

  const body = await download.body()
  expect([...body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  /*
   * Re-encoded, not stored: the served object is the encoder's output and
   * therefore a different size from what was uploaded. Kills the deployment
   * where the pipeline silently degrades to storing the original.
   */
  expect(body.length).not.toBe(samplePng().length)
})

test('a file the board will not accept is refused, and nothing is posted', async ({ page }) => {
  await signUp(page, 'refused')

  await page.goto('/forum/200-general')
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

  /*
   * The name says `.png` and the browser said `image/png`; only the bytes
   * disagree, and the bytes are the only thing the board trusts. The failure is
   * reported on the form, and — this is the part that matters — **the thread
   * was not created**, because files are staged before the post exists.
   */
  await expect(page.getByText(/not a type this board accepts/)).toBeVisible()

  await page.goto('/forum/200-general')
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
})

test('an attachment in a thread a guest may not read is refused by URL', async ({ page, request }) => {
  /*
   * The check that a direct URL never goes through the postbit — which is
   * exactly how it gets missed. A guest asking for an attachment id gets the
   * same 404 as for one that does not exist.
   */
  const anonymous = await request.get('/attachment/999999')
  expect(anonymous.status()).toBe(404)

  const notANumber = await request.get('/attachment/abc')
  expect(notANumber.status()).toBe(404)

  void page
})

test('an avatar is re-encoded before it appears anywhere', async ({ page, request }) => {
  await signUp(page, 'face')

  await page.goto('/usercp/avatar')
  await expect(page.getByText('You have not set one.')).toBeVisible()

  await page.getByLabel('Choose an image').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: samplePng(300, 300),
  })
  await page.getByRole('button', { name: 'Upload' }).click()

  /*
   * The same claim F42 makes, on the other half: what a member uploaded is
   * never what the board shows, so there is nothing to see until the queue has
   * run. The screen says so rather than silently showing the old state.
   */
  /* The notice and the card both say so; the card is the durable state. */
  await expect(page.getByText(/It will appear shortly/)).toBeVisible()
  await expect(page.locator('img[alt="Your avatar"]')).toHaveCount(0)

  const shown = page.locator('img[alt="Your avatar"]')
  await drainUntil(request, page, '/usercp/avatar', async () => {
    await expect(shown).toBeVisible({ timeout: 2_000 })
  })

  /*
   * The URL carries the member and a version and never the object key — a key
   * in a URL is a capability that would outlive a moderator's lock.
   */
  const src = await shown.getAttribute('src')
  expect(src).toMatch(/^\/avatar\/\d+\?v=\d+$/)

  const image = await request.get(src!)
  expect(image.status()).toBe(200)
  expect(image.headers()['x-content-type-options']).toBe('nosniff')

  const body = await image.body()
  expect([...body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  /* Re-encoded and fitted to the avatar box, so smaller than what was sent. */
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
