import { expect, test } from '@playwright/test'

import { samplePng } from './support/png'
import { signUp } from './support/session'

test('typing @ opens mention suggestions, and picking one inserts the name', async ({
  page,
  browser,
}) => {
  // formatting.spec.ts's mention test is the first thing in the whole e2e run
  // that calls searchMentionCandidatesAction, so it alone pays next dev's
  // one-time JIT compile for that action's module graph. That's real, if
  // modest, so keep some headroom for it — but see the comment below on
  // pressSequentially: it is not the reason this test used to flake.
  test.setTimeout(60_000)

  const targetContext = await browser.newContext()
  const targetPage = await targetContext.newPage()
  const targetUsername = await signUp(targetPage, 'mentionable')
  await targetContext.close()

  await signUp(page, 'mentioner')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  await expect(page.getByRole('group', { name: 'Formatting' })).toBeVisible()

  const message = page.getByLabel('Message')
  await message.fill('hi ')
  // The mention dropdown is driven entirely off the textarea's native `input`
  // event: each keystroke re-evaluates the token under the caret and (after a
  // debounce) asks the server for matches. `fill()` sets the whole string in
  // one atomic native-input-event dispatch, which — unlike a real person
  // typing — gives the app exactly one chance to receive that event. When
  // that single dispatch was delivered while the page was still settling
  // (e.g. mid-hydration on a page that had just client-side-navigated in),
  // the app's own `input` listener could miss it entirely, and nothing else
  // ever re-triggered the search: hence "the option never appears" rather
  // than "it takes a while to appear". `pressSequentially` fires a real,
  // separate `input` event per character, exactly like a person typing —
  // any one of those events is enough to open the dropdown, so this is not
  // just a more robust wait, it matches how the feature is actually used.
  await message.pressSequentially(`@${targetUsername.slice(0, 6)}`)

  const suggestion = page.getByRole('option', { name: `@${targetUsername}` })
  await expect(suggestion).toBeVisible({ timeout: 20_000 })
  await suggestion.click()

  await expect(message).toHaveValue(`hi @${targetUsername} `)
})

test('the "Insert attachment" toolbar button uploads and places [attachment=id]', async ({
  page,
}) => {
  // Same dev-server cold-compile risk as the mention test above: the upload
  // (with re-encode) and the thread-creation submit are both real server
  // round trips that can outrun the default budgets.
  test.setTimeout(60_000)

  await signUp(page, 'inlineattacher')

  await page.goto('/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()

  const title = `An inline picture ${Date.now()}`
  await page.getByLabel('Subject').fill(title)
  await page.getByLabel('Message').fill('Look at this:')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Insert attachment' }).click()
  const chooser = await fileChooserPromise
  await chooser.setFiles({ name: 'inline.png', mimeType: 'image/png', buffer: samplePng() })

  const message = page.getByLabel('Message')
  await expect(message).toHaveValue(/Look at this:\[attachment=\d+\]/, { timeout: 15_000 })

  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/, { timeout: 15_000 })
  await expect(page.locator('article .md-attachment')).toBeVisible()
})
