import { expect, test, type Page } from '@playwright/test'

/**
 * Installing a board, with scripting off.
 *
 * ## Why this spec did not exist until now
 *
 * `plan-status.md` recorded the reason feature after feature: the browser suite
 * runs against a seeded board, and `/install` is the one screen that cannot —
 * its first step applies the migrations that board already has, and its
 * preflight refuses to render a form once any account exists. It needs an
 * *empty* database, and then it **seals** it, so it is a fixture exactly one
 * spec can consume. `playwright.config.ts` now starts a second PGlite and a
 * second server for precisely that, and this is the spec they exist for.
 *
 * The cost of not having it was not hypothetical. Every install bug fixed in
 * this branch — a group key misspelled by one character, a refusal reported as
 * a system fault, a redirect to a page with no notice for its own query
 * parameter — was in code with unit tests around it, and was invisible to all of
 * them because each lived in the seam between two tested things.
 *
 * ## Scripting off, and that is the whole point
 *
 * R5 says the board works without JavaScript, and this page is where that claim
 * matters most: it is the first screen a new operator loads, on a fresh
 * deployment, possibly from a phone on a bad connection. An installer that needs
 * JavaScript to submit is an installer that sometimes cannot.
 *
 * With scripting off there is no `useActionState`, so every message here arrives
 * on a *re-rendered page* — which is the harder case and the one that has broken
 * twice. The `<details>` that opens itself on a failure has to open from an
 * attribute in the HTML, not from React state, and the fields have to be
 * repopulated by the server rather than kept in the DOM.
 *
 * ## One test, in order, on purpose
 *
 * Installing is a sequence with one irreversible end, so this is a single test
 * that walks it: refuse, retry, install, seal. Splitting it into four would mean
 * four tests sharing one non-resettable fixture, three of which fail if the
 * first one changes what it leaves behind.
 */
test.use({ javaScriptEnabled: false })

const BOARD = 'E2E Test Board'
const ADMIN = 'boardowner'
const PASSWORD = 'correct horse battery staple'

/**
 * How a heading is actually drawn, as the browser resolves it.
 *
 * Computed style rather than a class name, because the class is not the claim.
 * `font-serif` resolved through `--font-newsreader` and a five-deep fallback
 * stack is what the reader sees, and asserting `class="font-serif"` would keep
 * passing if the variable stopped being in scope on this route.
 */
async function headingStyle(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      family: style.fontFamily.split(',')[0]?.trim(),
      size: style.fontSize,
      weight: style.fontWeight,
    }
  })
}

test('a board is installed from an empty database, with no scripting', async ({ page }) => {
  await page.goto('/install')

  /*
   * Nothing on this page is set in a serif.
   *
   * The installer renders no `PageShell` — it runs before there is a board — so
   * there is no shared layout keeping its type honest, and it had drifted twice:
   * a 30px heading where the board's are 24px, and a serif face the component
   * set moved off deliberately. Asserted as computed style rather than as an
   * absent class, because `font-serif` is only one of the ways a serif could get
   * here; what matters is what the reader is shown.
   */
  for (const selector of ['h1', '#preflight', '[data-slot=card-title]']) {
    const { family } = await headingStyle(page, selector)
    expect(family, `${selector} should not be set in a serif`).not.toMatch(
      /newsreader|serif|georgia|baskerville|hoefler/i,
    )
  }

  /* ---------------------------------------------------------------- *
   * The preflight
   * ---------------------------------------------------------------- */

  /*
   * The passing checks are folded. This is the difference between a screen that
   * says what needs a decision and one that makes the reader audit seven
   * identical rows to discover that six of them were fine.
   */
  const passed = page.getByRole('group').filter({ hasText: /checks? passed/ })
  await expect(passed).toBeVisible()
  await expect(passed).not.toHaveAttribute('open', '')

  /*
   * Mail is unconfigured on a fresh board, so exactly one warning is expanded
   * and the form is offered anyway — warnings never block.
   */
  await expect(page.getByText('Mail is not configured yet')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Install' })).toBeVisible()

  /* Three numbered sections, in order. */
  await expect(page.getByRole('heading', { name: 'Your board' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sending mail' })).toBeVisible()

  /*
   * `APP_URL` is unset on this server, so the board-address box is rendered and
   * prefilled from the address the page was served at. That prefill is what
   * makes host-header poisoning safe here — it is confirmed by a human rather
   * than stored unread — so its presence is worth asserting.
   */
  await expect(page.locator('#boardUrl')).toHaveValue(/^http:\/\/127\.0\.0\.1:\d+$/)

  /* ---------------------------------------------------------------- *
   * The refusal an operator is most likely to hit
   * ---------------------------------------------------------------- */

  /*
   * `admin` is the first entry in `reservedUsernames` and the obvious thing to
   * type into a box on an installer. The form says so before the submit — which
   * is the cheaper half of the fix — and the board refuses it after.
   */
  await expect(page.locator('#username-description, #field-username-description'))
    .toContainText('admin')

  await page.locator('#boardName').fill(BOARD)
  await page.locator('#username').fill('admin')
  await page.locator('#email').fill('owner@example.test')
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Install' }).click()

  /*
   * A refusal of an *answer*, reported as one. The headline names the step by
   * its title — never its id, which is `admin` and would read as though the
   * installer were quoting the name that had just been typed.
   */
  const outcome = page.getByRole('alert').filter({ hasText: 'did not finish' })
  await expect(outcome).toContainText('“Create the administrator” did not finish.')
  await expect(outcome).not.toContainText('“admin” step')

  /* The box is marked, and the summary links to it. */
  await expect(page.locator('#username')).toHaveAttribute('aria-invalid', 'true')
  await expect(outcome.getByRole('link', { name: /name/i })).toHaveAttribute('href', '#username')

  /*
   * How far it got — the report that decides whether trying again is safe.
   *
   * Opened by the server, not by React: with scripting off, a `<details>` that
   * relied on client state would render closed and the answer would be behind a
   * summary nobody knew to click.
   */
  const report = page.getByRole('group').filter({ hasText: 'How far it got' })
  await expect(report).toHaveAttribute('open', '')
  await expect(report).toContainText('Apply migrations')
  await expect(report.getByRole('listitem').nth(0)).toContainText('done')
  await expect(report.getByRole('listitem').nth(1)).toContainText('done')
  await expect(report.getByRole('listitem').nth(2)).toContainText('failed')
  /* Sequential steps: what never started is "not run", not a second failure. */
  await expect(report.getByRole('listitem').nth(3)).toContainText('not run')
  await expect(report.getByRole('listitem').nth(4)).toContainText('not run')

  /* The button admits the board is part-built rather than offering a fresh start. */
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()

  /*
   * What survived the round trip, and what deliberately did not. The board name
   * is echoed because retyping it is friction; the password is not, because a
   * password re-rendered into HTML is a password in a proxy log and in the
   * back-forward cache.
   */
  await expect(page.locator('#boardName')).toHaveValue(BOARD)
  await expect(page.locator('#password')).toHaveValue('')

  /* ---------------------------------------------------------------- *
   * The install
   * ---------------------------------------------------------------- */

  await page.locator('#username').fill(ADMIN)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Try again' }).click()

  /*
   * To the sign-in page, **with a notice**. The parameter has always been on the
   * redirect and the page had no entry for it, so the one screen confirming an
   * irreversible five-step install was an ordinary sign-in form.
   */
  await expect(page).toHaveURL(/\/login\?installed=1$/)
  await expect(page.getByText('Your board is installed')).toBeVisible()

  /* ---------------------------------------------------------------- *
   * The seal, and the board it left behind
   * ---------------------------------------------------------------- */

  /*
   * A 404, not an "already installed" page. An informative page would confirm to
   * anybody who asked that this is a board, that it is installed, and — more
   * usefully to them — that the route was once reachable.
   */
  const sealed = await page.goto('/install')
  expect(sealed?.status()).toBe(404)

  /* The administrator can sign in, which is the only proof the account is real. */
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(ADMIN)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  /*
   * The board is named, and it has a community. A board whose index is empty looks
   * broken rather than new, which is the whole reason the installer creates one.
   */
  await expect(page.getByRole('link', { name: 'General discussion' })).toBeVisible()

  /*
   * And the control panel asks for the password again, saying so *without*
   * claiming a session expired. Every administrator meets this once, straight
   * after installing, and was told a session they had never had had run out.
   */
  await page.goto('/admin')
  await expect(page.getByText('Confirm your password')).toBeVisible()
  await expect(page.getByText(/session has expired/)).toHaveCount(0)
})
