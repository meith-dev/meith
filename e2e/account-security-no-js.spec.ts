/**
 * The three things a member does to their own account: change the password,
 * change the address, and get back in when they have forgotten the first.
 *
 * None of it had browser coverage, and all of it is where a forum loses people:
 * a reset flow that half works is an account nobody recovers. The unit tiers
 * hold the token rules — single use, expiry, the enumeration defence — and what
 * only a browser can show is the *round trip*: a link that arrives, a form that
 * accepts it once, and a password that then signs somebody in.
 *
 * With scripting off, like every other write on this board.
 */
import { expect, test } from '@playwright/test'

import { PASSWORD, signIn, signUp } from './support/session'

test.use({ javaScriptEnabled: false })

const NEW_PASSWORD = 'a-second-long-enough-password'

test('a member changes their password and signs in with the new one', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    const member = await signUp(page, 'newpw')

    await page.goto('/usercp/security')
    await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible()

    /*
     * The current password is required, and refusing without it is the whole
     * control: a stolen session cookie must not be able to change the password
     * and lock the real owner out of their own board.
     */
    await page.getByLabel('Current password').first().fill('not-my-password')
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('New password again').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('That is not your current password.')).toBeVisible()

    /* The old one still works, which is the assertion that the refusal held. */
    await context.clearCookies()
    await signIn(page, member, PASSWORD)

    /* Now with the right current password. */
    await page.goto('/usercp/security')
    await page.getByLabel('Current password').first().fill(PASSWORD)
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('New password again').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Change password' }).click()

    /* The new password is the one that works, and the old one is not. */
    await context.clearCookies()
    await page.goto('/login')
    await page.getByLabel('Username or email').fill(member)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL('/')

    await signIn(page, member, NEW_PASSWORD)
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
  } finally {
    await context.close()
  }
})

/**
 * Changing the address does not change the address — not yet.
 *
 * The screen says so in as many words, and it is the property worth pinning:
 * an address that changed on submit would let somebody who found an unattended
 * session move the account to their own mailbox and then use the reset flow.
 * Nothing moves until the link sent to the *new* address is followed.
 */
test('an e-mail change needs the password, and nothing moves until it is confirmed', async ({
  page,
}) => {
  const member = await signUp(page, 'newmail')
  const current = `${member}@example.test`

  await page.goto('/usercp/security')
  await expect(page.getByText(`Currently ${current}.`)).toBeVisible()

  /* The wrong password changes nothing. */
  await page.getByLabel('Current password').last().fill('not-my-password')
  await page.getByLabel('New e-mail address').fill(`${member}-moved@example.test`)
  await page.getByRole('button', { name: 'Send confirmation' }).click()
  await page.goto('/usercp/security')
  await expect(page.getByText(`Currently ${current}.`)).toBeVisible()

  /* And the right one only sends: the address on file is still the old one. */
  await page.getByLabel('Current password').last().fill(PASSWORD)
  await page.getByLabel('New e-mail address').fill(`${member}-moved@example.test`)
  await page.getByRole('button', { name: 'Send confirmation' }).click()

  await page.goto('/usercp/security')
  await expect(page.getByText(`Currently ${current}.`)).toBeVisible()
})

/**
 * A confirmation link that is not one lands somewhere that says so.
 *
 * The interesting half is that it is the *same* screen with a warning rather
 * than an error page: somebody who followed a stale link from an old mail needs
 * the form, not a dead end.
 */
test('a spent e-mail confirmation link says so on the screen that can retry it', async ({
  page,
}) => {
  await signUp(page, 'stalelink')

  await page.goto('/usercp/email/confirm?token=not-a-real-token')
  await expect(page).toHaveURL(/\/usercp\/security\?failed=1$/)
  await expect(page.getByText(/no longer valid/)).toBeVisible()
  /* The form is right there. */
  await expect(page.getByRole('button', { name: 'Send confirmation' })).toBeVisible()
})

/**
 * The whole reset round trip, in one test because it is one journey.
 *
 * The link is followed from the screen rather than fished out of a mailbox:
 * `requestResetAction` returns the token to the form **only when `NODE_ENV` is
 * development**, which `next dev` is — and that gate is itself a security
 * control worth exercising from the side that is allowed to see it, since the
 * alternative is teaching this spec to parse the mail log and calling it a test
 * of the reset flow.
 *
 * What the board must never do is *say* whether the address exists, so the
 * notice is asserted to be the same sentence on both paths.
 */
test('a member resets a forgotten password and signs in with the new one', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    const member = await signUp(page, 'forgot')
    await context.clearCookies()

    /* An address nobody has: the notice is identical, and there is no link. */
    await page.goto('/reset')
    await page.getByLabel('Email').fill('nobody-at-all@example.test')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    const notice = 'If an account exists for that email, a password reset link has been sent.'
    await expect(page.getByText(notice)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue to reset your password' })).toHaveCount(0)

    /* The real address: same sentence, and this time a token behind it. */
    await page.goto('/reset')
    await page.getByLabel('Email').fill(`${member}@example.test`)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText(notice)).toBeVisible()

    const link = page.getByRole('link', { name: 'Continue to reset your password' })
    await expect(link).toBeVisible()
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/reset\/confirm\?token=.+/)

    await link.click()
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel(/again|Confirm/i).fill(NEW_PASSWORD)
    await page.getByRole('button', { name: /Set|Change|Save|Reset/ }).click()

    /* The new password works. */
    await context.clearCookies()
    await signIn(page, member, NEW_PASSWORD)
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()

    /*
     * And the link is spent. A reset token that survives its own use is a live
     * credential sitting in somebody's mailbox for as long as they keep the
     * message.
     */
    await context.clearCookies()
    await page.goto(href!)
    await page.getByLabel('New password', { exact: true }).fill('a-third-long-enough-password')
    await page.getByLabel(/again|Confirm/i).fill('a-third-long-enough-password')
    await page.getByRole('button', { name: /Set|Change|Save|Reset/ }).click()
    await expect(page.getByText(/invalid|expired|no longer/i).first()).toBeVisible()

    /* Proof it really did not take: the second password is still the one. */
    await context.clearCookies()
    await signIn(page, member, NEW_PASSWORD)
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
  } finally {
    await context.close()
  }
})

/**
 * A reset address with no token is a screen, not a crash.
 *
 * Mail clients truncate long URLs and people copy them by hand, so this is the
 * commonest way the link arrives broken — and it has to lead back to the form.
 */
test('a reset link with no token offers a new one', async ({ page }) => {
  await page.goto('/reset/confirm')
  await expect(page.getByRole('heading', { name: 'Invalid reset link' })).toBeVisible()
  await page.getByRole('link', { name: 'Request a new link' }).click()
  await expect(page).toHaveURL('/reset')
})

/**
 * The options screen, which is where a member's clock comes from.
 *
 * Worth a browser specifically: the timezone is stored per member and read on
 * every page that renders a time, so "saved" and "in force" are two different
 * facts and only the second is the feature.
 */
test('a member’s timezone is saved and used to render times', async ({ page }) => {
  await signUp(page, 'clock')

  await page.goto('/usercp/options')
  await page.getByLabel('Timezone').selectOption('Pacific/Kiritimati')
  await page.getByRole('button', { name: /Save/ }).click()

  await page.goto('/usercp/options')
  await expect(page.getByLabel('Timezone')).toHaveValue('Pacific/Kiritimati')

  /*
   * The board's footer states the zone it is rendering in, on every page. It
   * read "UTC" for everybody before this member chose one, which is what makes
   * it the honest place to look for the effect.
   */
  await page.goto('/')
  await expect(page.getByText(/Times are shown in Pacific\/Kiritimati/)).toBeVisible()
})
