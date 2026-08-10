import { expect, test } from '@playwright/test'

import { drainUntil, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const VIEWS = [
  { path: 'new', tab: 'New posts' },
  { path: 'today', tab: "Today's posts" },
  { path: 'mine', tab: 'My threads' },
  { path: 'participated', tab: 'My posts' },
  { path: 'unanswered', tab: 'Unanswered' },
] as const

test('/discover sends a bare address to the first view', async ({ page }) => {
  await page.goto('/discover')
  await expect(page).toHaveURL('/discover/new')
})

test('each discovery view is its own address, reachable from the tabs', async ({ page }) => {
  await page.goto('/discover/new')

  for (const view of VIEWS) {
    await page
      .getByRole('navigation', { name: 'Discovery views' })
      .getByRole('link', { name: view.tab, exact: true })
      .click()
    await expect(page).toHaveURL(`/discover/${view.path}`)
    await expect(page.getByRole('heading', { name: view.tab })).toBeVisible()
  }
})

test('a view that is not one of the five is a 404', async ({ page }) => {
  const response = await page.goto('/discover/everything')
  expect(response?.status()).toBe(404)
})

test('a member’s own thread appears under My threads and My posts', async ({ page }) => {
  await signUp(page, 'finder')

  await page.goto('/discover/mine')
  await expect(page.getByText('Nothing here right now.')).toBeVisible()

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  const title = `Find me later ${Date.now().toString(36)}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Started by the member who will look for it.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  await page.goto('/discover/mine')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await page.goto('/discover/participated')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await page.goto('/discover/unanswered')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await page.context().clearCookies()
  await page.goto('/discover/mine')
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
})

test('answering a thread takes it out of Unanswered', async ({ browser }) => {
  const authorContext = await browser.newContext()
  const replierContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const replierPage = await replierContext.newPage()

  try {
    await signUp(authorPage, 'asked')
    await signUp(replierPage, 'answers')

    await authorPage.goto('/200-general')
    await authorPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Anyone? ${Date.now().toString(36)}`
    await authorPage.getByLabel('Subject').fill(title)
    await authorPage.getByLabel('Message').fill('A question nobody has answered.')
    await authorPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = authorPage.url()

    await replierPage.goto('/discover/unanswered')
    await expect(replierPage.getByRole('link', { name: title })).toBeVisible()

    await replierPage.goto(`${threadUrl}/reply`)
    await replierPage.getByLabel('Message').fill('Answered.')
    await replierPage.getByRole('button', { name: 'Post reply' }).click()
    await expect(replierPage).toHaveURL(/#pid-\d+$/)

    await replierPage.goto('/discover/unanswered')
    await expect(replierPage.getByRole('link', { name: title })).toHaveCount(0)
  } finally {
    await authorContext.close()
    await replierContext.close()
  }
})

test('a member who has just looked at the board is on the online list', async ({ page }) => {
  const member = await signUp(page, 'present')

  await page.goto('/online')
  await expect(page.getByRole('heading', { name: 'Who’s online' })).toBeVisible()
  await expect(page.getByRole('link', { name: member, exact: true })).toBeVisible()
  await expect(page.getByText(/\d+ members? and \d+ guests?/)).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Who’s online' })).toBeAttached()
})

test('the board statistics say they are uncounted, then the tick counts them', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000)

  await page.goto('/stats')
  await expect(page.getByRole('heading', { name: 'Board statistics' })).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Top 10 posters' })).toBeVisible()
  await expect(page.getByText('admin').first()).toBeVisible()

  await drainUntil(request, page, '/stats', async () => {
    await expect(page.getByText('The totals below have not been counted yet')).toHaveCount(0, {
      timeout: 2_000,
    })
  })

  const totals = page.getByRole('region', { name: 'Totals' })
  await expect(totals.getByText(/^[1-9]\d*$/).first()).toBeVisible()
})

test('a member’s reputation page shows the ratings behind the number', async ({ page }) => {
  await page.goto('/member/1/reputation')

  await expect(page.getByRole('heading', { name: 'admin’s reputation' })).toBeVisible()
  await expect(page.getByText(/^[+-]?\d+ \(\d+ positive\)/)).toBeVisible()

  const seeded = page.getByRole('listitem').filter({ hasText: 'Runs a good board.' })
  await expect(seeded).toBeVisible()
  await expect(seeded).toContainText('wellwisher')

  await expect(page.getByRole('button', { name: 'Thanks' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Back to their profile' }).click()
  await expect(page).toHaveURL('/member/1')
})

test('a member rates another member, and the page shows who said what', async ({ browser }) => {
  const raterContext = await browser.newContext()
  const subjectContext = await browser.newContext()
  const raterPage = await raterContext.newPage()
  const subjectPage = await subjectContext.newPage()

  try {
    const subject = await signUp(subjectPage, 'rated')
    await signUp(raterPage, 'rater')

    await raterPage.goto(`/member/by-name/${subject}`)
    await expect(raterPage).toHaveURL(/\/member\/\d+$/)
    await raterPage.goto(`${raterPage.url()}/reputation`)

    await expect(raterPage.getByRole('heading', { name: `Rate ${subject}` })).toBeVisible()

    const comment = `Answered my question ${Date.now().toString(36)}.`
    await raterPage.getByLabel('Why (optional)').fill(comment)
    await raterPage.getByRole('button', { name: 'Thanks', exact: true }).click()

    await expect(raterPage.getByRole('listitem').filter({ hasText: comment })).toBeVisible()
    await expect(raterPage.getByText('+1 (1 positive)')).toBeVisible()

    await subjectPage.goto(`/member/by-name/${subject}`)
    await expect(subjectPage.getByText('+1 (1 positive)')).toBeVisible()
  } finally {
    await raterContext.close()
    await subjectContext.close()
  }
})
