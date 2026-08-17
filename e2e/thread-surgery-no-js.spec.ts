import { type Browser, expect, type Page, test } from '@playwright/test'

import { signInAsModerator, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const GENERAL = '/200-general'

async function threadWith(page: Page, subject: string, bodies: readonly string[]): Promise<string> {
  await page.goto(GENERAL)
  await page.getByRole('link', { name: 'New thread' }).click()
  await page.getByLabel('Subject').fill(subject)
  await page.getByLabel('Message').fill(bodies[0]!)
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  const url = page.url().split('#')[0]!
  for (const body of bodies.slice(1)) {
    await page.goto(`${url}/reply`)
    await page.getByLabel('Message').fill(body)
    await page.getByRole('button', { name: 'Post reply' }).click()
    await expect(page).toHaveURL(/#post-\d+$/)
  }
  return url
}

async function twoSeats(browser: Browser, label: string) {
  const memberContext = await browser.newContext({ javaScriptEnabled: false })
  const member = await memberContext.newPage()
  await signUp(member, label)

  const modContext = await browser.newContext({ javaScriptEnabled: false })
  const mod = await modContext.newPage()
  await signInAsModerator(mod)

  return {
    member,
    mod,
    close: async () => {
      await memberContext.close()
      await modContext.close()
    },
  }
}

test('a moderator splits a thread at a post, and lands on the new one', async ({ browser }) => {
  const { member, mod, close } = await twoSeats(browser, 'split')

  try {
    const subject = `A thread that wanders ${Date.now()}`
    const url = await threadWith(member, subject, [
      'The subject everybody came for.',
      'Still about the subject.',
      'And here it turns into something else entirely.',
    ])

    await mod.goto(url)

    const from = mod.getByRole('combobox', { name: 'Split from post' })
    await expect(from.locator('option')).toHaveCount(2)
    await expect(from.locator('option').first()).toHaveText(/^#2 /)

    const splitTitle = `Split off ${Date.now()}`
    await from.selectOption({ index: 1 })
    await mod.getByRole('textbox', { name: 'New thread title' }).fill(splitTitle)
    await mod.getByRole('button', { name: 'Split', exact: true }).click()

    await expect(mod).toHaveURL(/\/thread\/\d+-split-off-\d+\?tool=split&n=1$/)
    await expect(mod.getByText('Thread split. You are looking at the new one.')).toBeVisible()
    await expect(mod.getByRole('heading', { name: splitTitle })).toBeVisible()

    const splitUrl = mod.url().split('?')[0]!

    await expect(mod.getByText('And here it turns into something else entirely.')).toBeVisible()

    await member.goto(url)
    await expect(member.getByText('The subject everybody came for.')).toBeVisible()
    await expect(member.getByText('Still about the subject.')).toBeVisible()
    await expect(member.getByText('And here it turns into something else entirely.')).toHaveCount(0)

    await member.goto(GENERAL)
    await expect(member.getByRole('link', { name: subject })).toBeVisible()
    await expect(member.getByRole('link', { name: splitTitle })).toBeVisible()

    await member.goto(`${splitUrl}/reply`)
    await member.getByLabel('Message').fill('Carrying on in the new one.')
    await member.getByRole('button', { name: 'Post reply' }).click()
    await expect(member).toHaveURL(/#post-\d+$/)
  } finally {
    await close()
  }
})

test('the inline bar splits exactly the posts a moderator ticked', async ({ browser }) => {
  const { member, mod, close } = await twoSeats(browser, 'splitsel')

  try {
    const url = await threadWith(member, `Two conversations ${Date.now()}`, [
      'The question everybody came for.',
      'An answer to it.',
      'A different question, tucked into somebody else’s thread.',
      'One more word on the first one.',
    ])

    await mod.goto(url)

    await mod.getByLabel('Select post #3 for moderation').check()

    const bar = mod.locator('form#inline-moderation')
    const splitTitle = `Its own thread ${Date.now()}`
    await bar.getByRole('textbox', { name: 'Title for the new thread' }).fill(splitTitle)
    await bar.getByRole('button', { name: 'Split out' }).click()

    await expect(mod.getByRole('heading', { name: splitTitle })).toBeVisible()
    await expect(
      mod.getByText('A different question, tucked into somebody else’s thread.'),
    ).toBeVisible()

    await member.goto(url)
    await expect(member.getByText('The question everybody came for.')).toBeVisible()
    await expect(member.getByText('An answer to it.')).toBeVisible()
    await expect(member.getByText('One more word on the first one.')).toBeVisible()
    await expect(
      member.getByText('A different question, tucked into somebody else’s thread.'),
    ).toHaveCount(0)
  } finally {
    await close()
  }
})

test('a merged thread stops existing, and its posts are in the other one', async ({ browser }) => {
  const { member, mod, close } = await twoSeats(browser, 'merge')

  try {
    const keptSubject = `The thread that is kept ${Date.now()}`
    const keptUrl = await threadWith(member, keptSubject, ['The first of the two.'])
    const keptId = /\/thread\/(\d+)-/.exec(keptUrl)![1]!

    const goneSubject = `The thread that is merged away ${Date.now()}`
    const goneUrl = await threadWith(member, goneSubject, [
      'A duplicate of the first.',
      'With a reply of its own.',
    ])

    await mod.goto(goneUrl)

    await mod.getByRole('spinbutton', { name: 'Merge into thread number' }).fill(keptId)
    await mod.getByRole('button', { name: 'Merge away' }).click()

    await expect(mod).toHaveURL(new RegExp(`/thread/${keptId}-`))
    await expect(mod.getByRole('heading', { name: keptSubject })).toBeVisible()

    await member.goto(keptUrl)
    await expect(member.getByText('The first of the two.')).toBeVisible()
    await expect(member.getByText('A duplicate of the first.')).toBeVisible()
    await expect(member.getByText('With a reply of its own.')).toBeVisible()

    expect((await member.goto(goneUrl))?.status()).toBe(404)
    await member.goto(GENERAL)
    await expect(member.getByRole('link', { name: goneSubject })).toHaveCount(0)
    await expect(member.getByRole('link', { name: keptSubject })).toBeVisible()
  } finally {
    await close()
  }
})
