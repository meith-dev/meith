/**
 * Search, in a browser, with JavaScript off.
 *
 * There was no spec here, and the two failures it now pins are both invisible
 * from below — each one produces a search that runs, returns cleanly, and finds
 * nothing:
 *
 *   - **A guest could not search at all.** The stored search that carries the
 *     query is owned by an account or by a session, and a logged-out reader has
 *     neither, so the redirect landed on a search that its own creator was
 *     refused. Every guest, every term, a 404.
 *   - **A thread could not be found by its title.** The indexed document read
 *     `posts.subject`, a column nothing on this board writes; the thread's
 *     title is on `threads`. Bodies matched, titles did not, and searching for
 *     the title of a thread is the most common search a forum gets.
 *
 * Both needed a browser to see. Every layer underneath was individually correct
 * about a query nobody could reach with the words they would actually type.
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
 */
async function indexed(request: APIRequestContext, page: Page): Promise<void> {
  await expect(async () => {
    await request.get('/api/system/tick?secret=e2e-only-tick-secret-000000000000')
    await page.goto('/search?q=version')
    await expect(page.getByRole('link', { name: 'Version 0.1 is live' })).toBeVisible()
  }).toPass({ timeout: 60_000, intervals: [500, 1_000, 2_000, 5_000] })
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

test('a guest searches the board, by a word that is only in a title', async ({
  page,
  request,
}) => {
  /*
   * Three fixes in one navigation, which is roughly how they were found.
   *
   * The backfill: the seeded board arrives with no index at all, exactly as an
   * imported one does, and `indexed()` waits for the task that fills it. Until
   * that task existed the wait would never have ended — an operator had to know
   * to run a command.
   *
   * The guest half: this used to be a 404 on the redirect target, for every
   * term, for everybody who had not signed in — and the address bar still read
   * `/search/<token>`, so it looked like a broken link rather than like search
   * being unavailable.
   *
   * The title half: "version" appears in the seeded thread's *title* and in no
   * post's body, so a board indexing bodies alone answers this with nothing at
   * all while looking entirely healthy.
   */
  await indexed(request, page)

  await page.goto('/search')
  await page.getByLabel('Search for').fill('version')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/\/search\/[\w-]+$/)
  await expect(page.getByRole('heading', { name: /Results for/ })).toBeVisible()
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
  await indexed(request, page)
  await signUp(page, 'searcher')

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

test('a search that matches nothing says so rather than failing', async ({ page, request }) => {
  /*
   * The other half of the pair, and the reason the fixes above are not "make
   * search always return something": an empty result has to stay reachable and
   * legible, or the next real bug looks exactly like this.
   *
   * On an indexed board, so the assertion means "this term matched nothing"
   * rather than "nothing was matchable" — which is the state the whole of this
   * spec exists to tell apart.
   */
  await indexed(request, page)

  await page.goto('/search')
  await page.getByLabel('Search for').fill('zzunlikelyzz')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/\/search\/[\w-]+$/)
  await expect(page.getByText('Nothing matched')).toBeVisible()
})
