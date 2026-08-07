/**
 * Search, in a browser, with JavaScript off.
 *
 * There was no spec here, and the three failures it now pins all produce the
 * same thing: a search that runs, returns cleanly, and finds nothing.
 *
 *   - **A guest could not search at all.** The stored search that carries the
 *     query is owned by an account or by a session, and a logged-out reader has
 *     neither, so the redirect landed on a search that its own creator was
 *     refused. Every guest, every term, a 404.
 *   - **A thread could not be found by its title.** The indexed document read
 *     `posts.subject`, a column nothing on this board writes; the thread's
 *     title is on `threads`. Bodies matched, titles did not, and searching for
 *     the title of a thread is the most common search a forum gets.
 *   - **Nothing filled the index by itself.** A bulk insert writes no document,
 *     so an imported board answered everything with nothing until an operator
 *     knew to run a command.
 *
 * One test each, and they are kept apart on purpose: the guest case searches a
 * term that matches nothing, so it needs no index and cannot be mistaken for a
 * board that has not been indexed yet. A regression in one should not read as a
 * failure of another — which is exactly what these three did to each other.
 *
 * All of it needed a browser to see. Every layer underneath was individually
 * correct about a query nobody could reach with the words they would type.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

test.use({ javaScriptEnabled: false })

const PASSWORD = 'long-enough-password'

/**
 * Run the board's tick until the seeded posts are in the index.
 *
 * The fixture board is a bulk insert, so it starts with no `search_vector` at
 * all — which is the state an imported board is in, and the reason
 * `search.reindex` exists. Waiting for the task here rather than seeding the
 * vectors means the documents these specs match against were written by the
 * board's own code, and that the task an imported board depends on is covered
 * by every search below rather than by nothing.
 *
 * The tick URL is the production path — a cron drives it on a real board — so
 * this is not a test hook.
 *
 * The wait is shorter than the test timeout on purpose: a task that is due runs
 * on the first tick, so this passes in a second or two, and a failure should
 * report as "the index never filled" rather than as the whole test running out
 * of time with no reason attached.
 */
async function indexed(request: APIRequestContext, page: Page): Promise<void> {
  await expect(async () => {
    await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
    await page.goto('/search?q=version')
    await expect(page.getByRole('link', { name: 'Version 0.1 is live' })).toBeVisible()
  }).toPass({ timeout: 20_000, intervals: [500, 1_000, 2_000, 5_000] })
}

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

  /* The cookie notice is `sticky bottom-0` and would sit over the form. */
  await page.getByRole('button', { name: 'No thanks' }).click()

  return username
}

test('a guest reaches their own results page', async ({ page }) => {
  /*
   * The guest fix, isolated from everything else — deliberately searching a
   * term that matches nothing, so this test needs no index and cannot be
   * confused with one that is failing because the board is not indexed yet.
   *
   * A stored search is owned by an account or by a session, and the session key
   * is a hash of the session cookie — which a logged-out reader does not have.
   * So every guest search was stored with neither owner, and the ownership
   * check refused exactly those rows: the form submitted, the redirect landed,
   * and `/search/<token>` answered **404**, on every term, for everybody who
   * had not signed in. Reaching the page at all is the whole assertion.
   */
  await page.goto('/search')
  await page.getByLabel('Search for').fill('zzunlikelyzz')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/\/search\/[\w-]+$/)
  await expect(page.getByRole('heading', { name: /Results for/ })).toBeVisible()
  /*
   * And an empty result reads as one. The reason the other fixes here are not
   * "make search always return something": "nothing matched" has to stay
   * reachable and legible, or the next real bug looks exactly like this one.
   */
  await expect(page.getByText('Nothing matched')).toBeVisible()
})

test('the board indexes itself, and a title-only word finds its thread', async ({
  page,
  request,
}) => {
  /*
   * The other two fixes, in one navigation.
   *
   * The backfill: the seeded board arrives with no index at all, exactly as an
   * imported one does, and `indexed()` waits for the task that fills it. Until
   * that task existed this wait would never have ended — an operator had to
   * know to run a command, and a board nobody told answered every search with
   * nothing for ever.
   *
   * The title: "version" appears in the seeded thread's *title* and in no
   * post's body, so a board indexing bodies alone answers this with nothing at
   * all while looking entirely healthy. Still a guest, so the fix above carries
   * this one too.
   */
  await indexed(request, page)

  await page.goto('/search')
  await page.getByLabel('Search for').fill('version')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/\/search\/[\w-]+$/)
  await expect(page.getByRole('link', { name: 'Version 0.1 is live' })).toBeVisible()
})

test('a member pages through their own results and searches within them', async ({
  page,
  request,
}) => {
  /*
   * The signed-in half, and the two things a stored search is *for*: the
   * address survives, and "search within" composes rather than intersecting.
   * Both are reached through the same ownership check the guest case exercises
   * from the other side, so a change that widened one and broke the other would
   * fail here rather than in production.
   */
  /*
   * Signed in *before* the index is waited on, so the wait itself runs as a
   * member: a regression in the guest path should fail the guest test and leave
   * this one reporting on what it is named for.
   */
  await signUp(page, 'searcher')
  await indexed(request, page)

  await page.goto('/search')
  await page.getByLabel('Search for').fill('desk')
  await page.getByRole('button', { name: 'Search' }).click()

  const results = page.url()
  /*
   * `.first()` because there are two hits and both are right: the thread's
   * title carries the word, so its opening post matches at weight A, and a
   * reply says it in passing and matches at weight B. Before the title was
   * indexed there was exactly one — which is the shape of the bug, seen from
   * the side that looked like it was working.
   */
  const hit = page.getByRole('link', { name: 'Show us your desk setup' })
  await expect(hit.first()).toBeVisible()
  await expect(hit).toHaveCount(2)

  /* The address is the search: re-opening it re-runs the stored query. */
  await page.goto(results)
  await expect(hit.first()).toBeVisible()

  await page.getByLabel('Search within these results').fill('desk notebook')
  await page.getByRole('button', { name: 'Search within' }).click()
  await expect(page.getByRole('heading', { name: /Results for/ })).toBeVisible()
})
