import { expect, test, type Page } from '@playwright/test'

/**
 * Thanking a post, with scripting off.
 *
 * F62 shipped reputation and one way to reach it: a **Rate** link to a separate
 * page carrying a form. That is the right shape for a considered rating with a
 * reason and the wrong shape for what people actually do on a forum, which is
 * say thanks for an answer that helped — and it is why most boards' reputation
 * totals stay at zero.
 *
 * The board this runs against has `allow_negative` off and `comment_required`
 * off, which is the configuration the feature is for: the Thanks button is then
 * the *whole* rating control, and the Rate link is correctly absent rather than
 * sitting beside it leading to a page for pressing the same thing.
 *
 * Everything here needs a browser and a session, and it needs **no JavaScript**
 * specifically: a rating is a write, and the board's claim is that its writes
 * are native form posts. The toggle, the count and the redirect back to the
 * right post are all things a `<form>` and a redirect have to get right on
 * their own.
 */
test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'
const THREAD = '/thread/4-welcome-to-the-forum'

/** Register through the form, then sign in. The only way to get a session. */
async function signIn(page: Page): Promise<string> {
  const username = `e2e_thanks_${Date.now()}_${Math.floor(Math.random() * 1000)}`

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

/** The Thanks control on the first post, whichever state it is in. */
function thanks(page: Page) {
  return page.locator('article').first().getByRole('button', { name: /Thanks|Thanked/ })
}

test('a member thanks a post, and can take it back', async ({ page }) => {
  await signIn(page)
  await page.goto(THREAD)

  const button = thanks(page)
  await expect(button).toHaveText(/Thanks/)
  /* Not yet pressed by anybody, so no count to show. */
  await expect(button).toHaveAttribute('aria-pressed', 'false')

  await button.click()

  /*
   * The toggle. A plain "give +1" button does nothing visible on a second
   * press — re-rating *updates*, so the member gives +1 again — and a control
   * that appears not to work is worse than one that does the wrong thing,
   * because nobody reports it.
   */
  await expect(thanks(page)).toHaveText(/Thanked/)
  await expect(thanks(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(thanks(page)).toContainText('1')

  await thanks(page).click()
  await expect(thanks(page)).toHaveText(/Thanks/)
  await expect(thanks(page)).toHaveAttribute('aria-pressed', 'false')
})

/*
 * The count is the reason to press it. A rating whose effect is invisible is a
 * button into a void — and the number the postbit shows beside the author's
 * name is their board-wide total, which is a different fact.
 */
test('a thanks moves the author’s reputation', async ({ page }) => {
  await signIn(page)
  await page.goto(THREAD)

  const postbit = page.locator('article').first()
  /* The seed gives `admin` one rating, from one member who is not them. */
  await expect(postbit.getByText(/1 reputation/)).toBeVisible()

  await thanks(page).click()

  /*
   * Two, and it is worth saying why this is the assertion that matters: the
   * total is *derived*, recomputed from the live rows inside the same
   * transaction as the write. A board that incremented a counter here would
   * pass this test and drift the first time somebody withdrew a rating.
   */
  await expect(page.locator('article').first().getByText(/2 reputation/)).toBeVisible()
})

/*
 * The redirect lands on the post that was pressed, not the top of the thread.
 * A reader who thanks post #47 on a long page and is returned to post #1 has
 * lost their place, which is the whole cost of a no-JavaScript control.
 */
test('pressing it returns the reader to the post they pressed', async ({ page }) => {
  await signIn(page)
  await page.goto(THREAD)

  /* The second post, so the anchor is not the one the page opens at anyway. */
  const second = page.locator('article').nth(1)
  await second.getByRole('button', { name: /Thanks/ }).click()

  await expect(page).toHaveURL(/#post-11$/)
})

/*
 * You cannot thank yourself — the service refuses it, so a control that offered
 * it would only ever lead to a refusal. `admin` is not a signable-in account in
 * this harness, so this is asserted the other way round: the member's own posts
 * carry no Thanks button.
 */
test('there is no Thanks button on your own post', async ({ page }) => {
  const username = await signIn(page)

  await page.goto('/forum/200-general')
  await page.getByRole('link', { name: 'New thread' }).click()
  await page.getByLabel('Subject').fill(`A thread of my own ${Date.now()}`)
  await page.getByLabel('Message').fill('Nobody should be able to thank me for this.')
  await page.getByRole('button', { name: 'Post thread' }).click()
  await expect(page).toHaveURL(/\/thread\/\d+-/)

  const mine = page.locator('article').first()
  await expect(mine.getByText(username, { exact: true }).first()).toBeVisible()
  await expect(mine.getByRole('button', { name: /Thanks|Thanked/ })).toHaveCount(0)
})

/*
 * With negatives off there is nothing on the rating form the button cannot do,
 * so the link to it is furniture. This is the assertion that the two controls
 * do not both ship.
 */
test('the Rate link gives way to the button on a thanks-only board', async ({ page }) => {
  await signIn(page)
  await page.goto(THREAD)

  await expect(thanks(page)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rate' })).toHaveCount(0)
})

/* A guest can read the thread and is offered nothing to press. */
test('a guest sees no Thanks button', async ({ page }) => {
  await page.goto(THREAD)
  await expect(page.getByRole('button', { name: /Thanks|Thanked/ })).toHaveCount(0)
})
