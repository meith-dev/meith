/**
 * F18's activation half: a board that makes you prove the address first.
 *
 * `registration.method` had **no reader at all** until F18 was finished — the
 * dropdown was in the panel and moving it changed nothing — and once it gained
 * one, nothing in the browser suite ever moved it. Every other spec registers
 * on a board set to `none`, which is the one value of four that takes none of
 * these paths. So the whole of the setting's consequence went unexercised: the
 * account that exists and cannot sign in, the screen it lands on, and the two
 * ways back from a link that did not work.
 *
 * ## What this spec does not do
 *
 * It does not follow a real confirmation link. The link is *mailed*, and the
 * e2e board runs `MAIL_DRIVER=log` — there is no mailbox for a browser to open,
 * and inventing one (a token surfaced on the page, a test-only route) would be
 * a hole in production cut for a test's convenience. The redemption path is
 * covered where it can be covered honestly: `activateAccount` returns a
 * discriminated outcome and the domain suite drives all five of them.
 *
 * What only a browser can show is the part either side of the mail, and that is
 * what is here: registering under the setting, being refused at the door, and
 * the two screens that get somebody unstuck.
 *
 * ## The setting is board-wide, so the teardown is not optional
 *
 * Left on `email`, `signUp` in `support/session.ts` stops working and every
 * write-path spec in the suite fails after this one. It is restored in a
 * `finally`, and the last assertion is that an ordinary registration works
 * again — a teardown nobody checks is a teardown that silently stops running.
 */
import { expect, test, type Page } from '@playwright/test'

import { STAFF_PASSWORD } from './support/config'
import { PASSWORD, enterAdminPanel } from './support/session'

test.use({ javaScriptEnabled: false })

/*
 * Headroom, not an estimate.
 *
 * Playwright's default is 30 seconds and these tests sit just under it, which
 * is the worst place to be: they passed alone and failed in a full run, twice,
 * on a navigation that was merely slow. The work is real rather than wasteful —
 * every `signUp` is a registration *and* a sign-in, so two Argon2id hashes, the
 * panel asks for the password a second time on purpose, and the board runs on
 * `DATABASE_POOL_MAX=1` (see `e2e/support/database.ts`), so none of it overlaps.
 *
 * A spec that fails one run in three teaches people to re-run it, after which a
 * real failure gets re-run too — the same reasoning `playwright.config.ts`
 * records for the installer's project.
 */
test.describe.configure({ timeout: 120_000 })

type Method = 'none' | 'email'

/** Move `registration.method`, in the panel, the way an operator would. */
async function setActivation(admin: Page, method: Method): Promise<void> {
  await admin.goto('/admin/settings?group=registration')
  await admin.locator('select[name="registration.method"]').selectOption(method)
  await admin.getByRole('button', { name: 'Save settings' }).click()
  await expect(admin.locator('select[name="registration.method"]')).toHaveValue(method)
}

/** Fill in the registration form. Deliberately not `signUp`: that one signs in. */
async function register(page: Page, username: string): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
}

test('a board that asks for the address to be proven will not let the account in', async ({
  browser,
}) => {
  const staff = await browser.newContext({ javaScriptEnabled: false })
  const admin = await staff.newPage()

  const visitorContext = await browser.newContext({ javaScriptEnabled: false })
  const visitor = await visitorContext.newPage()

  try {
    await enterAdminPanel(admin)
    await setActivation(admin, 'email')

    const username = `e2e_confirm_${Date.now().toString(36)}`
    const email = `${username}@example.test`
    await register(visitor, username)

    /*
     * Not `/login?registered=1`. The account exists and is unusable, and the
     * screen it lands on is the only one that can do anything about that: it
     * names the address, because a typo there is the commonest way this goes
     * wrong and seeing it written back is what makes it obvious.
     */
    await expect(visitor).toHaveURL(
      `/verify/resend?email=${encodeURIComponent(email)}&sent=1`,
    )
    await expect(
      visitor.getByRole('heading', { name: 'Confirm your account' }),
    ).toBeVisible()
    await expect(visitor.getByText(email)).toBeVisible()
    await expect(visitor.getByText(/until then you will not be able to sign in/)).toBeVisible()

    /*
     * And the door really is shut. This is the assertion the whole setting is
     * for: an account at `awaiting_activation` with the right password still
     * does not get a session, so a board using this to slow down spam is not
     * merely showing a different screen.
     */
    await visitor.goto('/login')
    await visitor.getByLabel('Username or email').fill(username)
    await visitor.getByLabel('Password').fill(PASSWORD)
    await visitor.getByRole('button', { name: 'Sign in' }).click()
    await expect(visitor).not.toHaveURL('/')
    await expect(visitor.getByRole('link', { name: 'Profile' })).toHaveCount(0)

    /*
     * The way back, for the person whose link never arrived. One notice on
     * every path — an unknown address gets the same sentence as a real one,
     * because any difference is an oracle answering "does this address have an
     * account here?" to whoever has a form.
     */
    await visitor.goto('/verify/resend')
    await visitor.getByLabel('Email').fill('nobody-at-all@example.test')
    await visitor.getByRole('button', { name: 'Send another link' }).click()
    const notice = await visitor.locator('main').innerText()

    await visitor.goto('/verify/resend')
    await visitor.getByLabel('Email').fill(email)
    await visitor.getByRole('button', { name: 'Send another link' }).click()
    expect(
      await visitor.locator('main').innerText(),
      'an address nobody has and a real one must read identically',
    ).toBe(notice)

    /*
     * A link that arrived broken. Mail clients truncate long URLs and people
     * copy them by hand, so a dead token is the ordinary case rather than an
     * attack — and it has to land somewhere with a way forward, which is the
     * sign-in screen carrying the offer of a new link.
     */
    await visitor.goto('/verify?token=not-a-real-token')
    await expect(visitor).toHaveURL('/login?verify=failed')
    await expect(
      visitor.getByText('That confirmation link is no longer valid. Ask for a new one below.'),
    ).toBeVisible()
    await visitor.getByRole('link', { name: 'Need a new confirmation link?' }).click()
    await expect(visitor).toHaveURL('/verify/resend')

    /* A link with no token at all is the same screen, not a crash. */
    await visitor.goto('/verify')
    await expect(visitor).toHaveURL('/login?verify=failed')
  } finally {
    await setActivation(admin, 'none')
    await staff.close()
  }

  /*
   * The teardown, asserted. Outside the `finally` on purpose: it has to run
   * after the restore, and it is the only thing that would catch a restore that
   * silently stopped working — which would take the rest of the suite with it.
   */
  const username = `e2e_after_${Date.now().toString(36)}`
  await register(visitor, username)
  await expect(visitor).toHaveURL(/\/login\?registered=1$/)
  await visitorContext.close()

  /* Nothing above disturbed the accounts that were already here. */
  const staffCheck = await browser.newContext({ javaScriptEnabled: false })
  const page = await staffCheck.newPage()
  await page.goto('/login')
  await page.getByLabel('Username or email').fill('admin')
  await page.getByLabel('Password').fill(STAFF_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
  await staffCheck.close()
})
