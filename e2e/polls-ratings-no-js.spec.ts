import { expect, test } from '@playwright/test'

import { signUp } from './support/session'

test.use({ javaScriptEnabled: false })

test('a thread opens with a poll, and another member votes in it', async ({ browser }) => {
  const authorContext = await browser.newContext()
  const voterContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const voterPage = await voterContext.newPage()

  try {
    await signUp(authorPage, 'pauthor')
    await signUp(voterPage, 'pvoter')

    await authorPage.goto('/200-general')
    await authorPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Ship it? ${Date.now()}`
    await authorPage.getByLabel('Subject').fill(title)
    await authorPage.getByLabel('Message').fill('Vote below.')
    await authorPage.getByText('Add a poll').click()
    await authorPage.getByLabel('Question').fill('Ship it?')
    await authorPage.getByLabel('Option 1').fill('Yes')
    await authorPage.getByLabel('Option 2').fill('No')
    await authorPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = authorPage.url()

    const authorPoll = authorPage.getByRole('region', { name: 'Poll' })
    await expect(authorPoll.getByText('Ship it?')).toBeVisible()
    await expect(authorPoll.getByText('Yes (0)')).toBeVisible()

    await voterPage.goto(threadUrl)
    const poll = voterPage.getByRole('region', { name: 'Poll' })
    await poll.getByLabel('Yes (0)').check()
    await poll.getByRole('button', { name: 'Vote' }).click()

    const pollAfter = voterPage.getByRole('region', { name: 'Poll' })
    await expect(pollAfter.getByText('Yes (1)')).toBeVisible()
    await expect(pollAfter.getByRole('button', { name: 'Vote' })).toHaveCount(0)
    await expect(pollAfter.getByText('1 vote')).toBeVisible()
  } finally {
    await authorContext.close()
    await voterContext.close()
  }
})

test('a multiple-choice poll names its voters, takes a second vote, and is edited', async ({
  browser,
}) => {
  const authorContext = await browser.newContext()
  const voterContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const voterPage = await voterContext.newPage()

  try {
    await signUp(authorPage, 'mauthor')
    const voter = await signUp(voterPage, 'mvoter')

    await authorPage.goto('/200-general')
    await authorPage.getByRole('link', { name: 'New thread' }).click()
    await authorPage.getByLabel('Subject').fill(`Which nights? ${Date.now()}`)
    await authorPage.getByLabel('Message').fill('Pick as many as suit you.')
    await authorPage.getByText('Add a poll').click()
    await authorPage.getByLabel('Question').fill('Which nights suit you?')
    await authorPage.getByLabel('Option 1').fill('Monday')
    await authorPage.getByLabel('Option 2').fill('Tuesday')
    await authorPage.getByLabel('Option 3').fill('Wednesday')
    await authorPage.getByLabel('Options each member may pick').fill('2')
    await authorPage.getByText('Let members change their vote').click()
    await authorPage.getByText('Show who voted for what').click()
    await authorPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = authorPage.url()

    await voterPage.goto(threadUrl)
    const poll = voterPage.getByRole('region', { name: 'Poll' })
    await expect(poll.getByText('Choose up to 2 options.')).toBeVisible()
    await expect(poll.getByText('Your name is shown beside what you vote for.')).toBeVisible()

    await poll.getByLabel('Monday (0)').check()
    await poll.getByLabel('Wednesday (0)').check()
    await poll.getByRole('button', { name: 'Vote' }).click()

    const voted = voterPage.getByRole('region', { name: 'Poll' })
    await expect(voted.getByText('Monday (1)')).toBeVisible()
    await expect(voted.getByText('Wednesday (1)')).toBeVisible()
    await expect(voted.getByText(`Voted for by ${voter}`).first()).toBeVisible()

    await voted.getByLabel('Wednesday (1)').uncheck()
    await voted.getByLabel('Tuesday (0)').check()
    await voted.getByRole('button', { name: 'Change your vote' }).click()

    const changed = voterPage.getByRole('region', { name: 'Poll' })
    await expect(changed.getByText('Tuesday (1)')).toBeVisible()
    await expect(changed.getByText('Wednesday (0)')).toBeVisible()

    await authorPage.goto(threadUrl)
    await authorPage.getByRole('link', { name: 'Edit poll' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+\/poll$/)
    await authorPage.getByLabel('Option 4').fill('Thursday')
    await authorPage.getByRole('button', { name: 'Save poll' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+$/)

    await expect(
      authorPage.getByRole('region', { name: 'Poll' }).getByText('Thursday (0)'),
    ).toBeVisible()
  } finally {
    await authorContext.close()
    await voterContext.close()
  }
})

test('a member rates a thread, and the average is public', async ({ browser }) => {
  const authorContext = await browser.newContext()
  const raterContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const raterPage = await raterContext.newPage()

  try {
    await signUp(authorPage, 'rauthor')
    await signUp(raterPage, 'rrater')

    await authorPage.goto('/200-general')
    await authorPage.getByRole('link', { name: 'New thread' }).click()
    const title = `Rate this ${Date.now()}`
    await authorPage.getByLabel('Subject').fill(title)
    await authorPage.getByLabel('Message').fill('Five stars only, please.')
    await authorPage.getByRole('button', { name: 'Post thread' }).click()
    await expect(authorPage).toHaveURL(/\/thread\/\d+-/)
    const threadUrl = authorPage.url()

    const rating = raterPage.getByRole('region', { name: 'Thread rating' })
    await raterPage.goto(threadUrl)
    await expect(rating.getByText('No ratings yet.')).toBeVisible()

    await rating.getByRole('button', { name: 'Rate 4 out of 5' }).click()

    const after = raterPage.getByRole('region', { name: 'Thread rating' })
    await expect(after.getByText('You rated this 4')).toBeVisible()
    await expect(after.getByText('4.0')).toBeVisible()

    await authorPage.goto(threadUrl)
    await expect(
      authorPage.getByRole('region', { name: 'Thread rating' }).getByText('4.0'),
    ).toBeVisible()
  } finally {
    await authorContext.close()
    await raterContext.close()
  }
})
