/**
 * Getting a session, for specs that need one.
 *
 * Every write-path spec begins the same way — register through the form, then
 * sign in — because that is the only way into this board: the seeded accounts
 * carry a hash nothing can match, deliberately, so that the path a member
 * actually takes is the one the suite exercises. It was copied verbatim into
 * ten files, which is nine places for it to drift from the form it drives.
 *
 * The staff half is here for the opposite reason. `admin` and the moderator
 * **cannot** be registered — a registration always lands in the Registered
 * group — so they are seeded with a real password (see `database.ts`), and the
 * two ways in are different enough that keeping them apart in the reader's head
 * is worth a named function each.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test'

/*
 * `config.ts`, never `database.ts`. The latter uses `import.meta.url`, which
 * forces ESM, and Playwright loads a spec through a CommonJS transform — so a
 * spec that reached the seeder for a constant would fail to load at all. That
 * is the whole reason `config.ts` exists; see its header.
 */
import { STAFF, STAFF_PASSWORD } from './config'

export const PASSWORD = 'long-enough-password'

/**
 * The board's own maximum, which the registration form enforces in the markup.
 *
 * `registration.username_max` defaults to 30 and the input carries
 * `maxlength="30"`, so a browser **silently truncates** anything longer as it is
 * typed. A spec that generated a 32-character name therefore registered a
 * 30-character account and then tried to sign in as the 32-character one, and
 * got "Incorrect username or password" — a failure that reads exactly like
 * broken authentication and is nothing of the kind. It cost an hour once; the
 * assertion below is so it cannot cost one again.
 */
const USERNAME_MAX = 30

/** Distinct per call, and short: two base-36 fields rather than 13 digits. */
let minted = 0

/**
 * Register through the form, then sign in.
 *
 * `label` names the member in the failure output — `e2e_uploader_…` says which
 * spec left a row behind far better than a random string does. The suffix is
 * what keeps two runs of the same spec from colliding on the username, since
 * the database outlives neither: base-36 milliseconds, plus a counter for the
 * calls inside one millisecond of each other.
 */
export async function signUp(page: Page, label: string): Promise<string> {
  const username = `e2e_${label}_${Date.now().toString(36)}${(minted++).toString(36)}`

  /*
   * Asserted rather than truncated here. Truncating would make two labels
   * collide into one name and produce a "that username is taken" failure in
   * whichever spec ran second — the same class of mystery, one step further
   * from its cause.
   */
  expect(
    username.length,
    `${username} is longer than the board allows, so the form would truncate it`,
  ).toBeLessThanOrEqual(USERNAME_MAX)

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

/** Sign in to the board as an account that already exists. */
export async function signIn(page: Page, username: string, password = PASSWORD): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
}

/** The seeded super moderator. Not an administrator — see `database.ts`. */
export async function signInAsModerator(page: Page): Promise<string> {
  await signIn(page, STAFF.moderator.username, STAFF_PASSWORD)
  return STAFF.moderator.username
}

/** The seeded administrator's **board** session. The panel is a second door. */
export async function signInAsAdmin(page: Page): Promise<string> {
  await signIn(page, STAFF.admin.username, STAFF_PASSWORD)
  return STAFF.admin.username
}

/**
 * Sign in to the board as the administrator, then open the control panel.
 *
 * Two steps because the board deliberately makes them two: the ACP session is
 * separate from the board session, short-lived, and asks for the password again
 * even though the browser is already signed in. A helper that hid that would
 * hide the property most worth having.
 */
export async function enterAdminPanel(page: Page): Promise<void> {
  await signInAsAdmin(page)

  await page.goto('/admin')
  await page.getByLabel('Password').fill(STAFF_PASSWORD)
  await page.getByRole('button', { name: 'Enter the control panel' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
}

/**
 * Run the board's tick until `check` passes.
 *
 * A single tick is *not* enough, and the reason is the scheduler working
 * correctly rather than a flake: `queue.drain` and most rollups have an
 * interval, so the second spec in a run that needs one finds the task not yet
 * due and the tick reports it skipped. "After exactly one tick" is
 * over-specifying — the contract is "once the queue has run".
 *
 * The tick URL is the production path: the serverless profile drives it with a
 * cron, so this is not a test hook.
 */
export async function drainUntil(
  request: APIRequestContext,
  page: Page,
  url: string,
  check: () => Promise<void>,
): Promise<void> {
  await expect(async () => {
    await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
    await page.goto(url)
    await check()
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 5_000, 10_000] })
}
