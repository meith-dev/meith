/**
 * The public REST API, from token to response.
 *
 * The unit tier holds the registry, the matcher and the scope table. What only
 * this can show is the seam the registry exists to protect: a token is **issued
 * in the control panel by a person**, and every request it makes is then
 * checked against *that person's* permissions as well as the token's scopes. A
 * scope narrows a token; it never widens the account. Both halves have to be
 * true at once, and neither is observable below the route.
 *
 * The token is minted through the ACP rather than seeded, deliberately: it is
 * shown exactly once, on the screen that creates it, and a suite that inserted a
 * row would never find out if that screen stopped showing it.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { enterAdminPanel } from './support/session'

/**
 * Issue a token in the panel and read it off the screen.
 *
 * `scopes` are ticked by their own labels — the checkboxes are named for the
 * scope strings the registry declares, which is what makes "this token may not
 * read posts" expressible from a browser at all.
 */
async function issueToken(page: Page, name: string, scopes: readonly string[]): Promise<string> {
  await enterAdminPanel(page)
  await page.goto('/admin/api-tokens')

  await page.getByLabel('Name').fill(name)
  for (const scope of scopes) {
    await page.getByRole('checkbox', { name: scope, exact: true }).check()
  }
  await page.getByRole('button', { name: 'Issue token' }).click()

  /*
   * Shown once and never again — the board stores a hash, so this is the only
   * moment the secret exists anywhere but the operator's clipboard. Read from
   * the page rather than from a fixture for exactly that reason: a screen that
   * stopped printing it would leave every token ever issued unusable, and a
   * seeded row would never notice.
   */
  const shown = page.getByRole('status').filter({ hasText: 'Copy this now' })
  await expect(shown).toBeVisible()
  const secret = ((await shown.locator('code').textContent()) ?? '').trim()
  expect(secret, 'the panel must show the new token once').toMatch(/^forum_pat_\w+_\S{20,}$/)
  return secret
}

function bearer(request: APIRequestContext, token: string) {
  return {
    get: (path: string) =>
      request.get(`/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } }),
    post: (path: string, data: unknown) =>
      request.post(`/api/v1${path}`, {
        headers: { authorization: `Bearer ${token}` },
        data: data as Record<string, unknown>,
      }),
  }
}

/** The `error` envelope, minus the request id — which differs per request. */
async function refusal(response: { json: () => Promise<unknown> }): Promise<string> {
  const { error } = (await response.json()) as { error: { code: string; message: string } }
  return `${error.code}|${error.message}`
}

test('the API refuses every request that carries no usable token', async ({ request }) => {
  /*
   * Two sentences, and the split is the design rather than an inconsistency.
   *
   * "Send a bearer token" answers *no credential at all* — a header that is
   * absent, empty, or not a bearer scheme. Nothing is being confirmed there:
   * the caller has not named a token, so there is nothing to enumerate.
   *
   * A token that was named and did not work gets the other sentence, and gets
   * the *same* one whatever was wrong with it. That is the claim that matters,
   * and `a revoked token…` below is where it is proved from the other side.
   */
  const unnamed = await Promise.all([
    request.get('/api/v1/me'),
    request.get('/api/v1/forums'),
    request.get('/api/v1/me', { headers: { authorization: 'nonsense' } }),
    request.get('/api/v1/me', { headers: { authorization: 'Bearer ' } }),
  ])

  const messages = new Set<string>()
  for (const answer of unnamed) {
    expect(answer.status()).toBe(401)
    messages.add(await refusal(answer))
  }
  expect(messages.size, 'a missing credential reads the same everywhere').toBe(1)
  expect([...messages][0]).toContain('unauthenticated')

  const wrong = await request.get('/api/v1/me', {
    headers: { authorization: 'Bearer not-a-real-token' },
  })
  expect(wrong.status()).toBe(401)
  expect(await refusal(wrong)).toBe('unauthenticated|That token is not valid.')
})

test('a token reaches what its scopes allow and nothing else', async ({ page, request }) => {
  const token = await issueToken(page, `e2e read ${Date.now().toString(36)}`, [
    'forums:read',
    'threads:read',
  ])
  const api = bearer(request, token)

  /*
   * `/me` needs `members:read`, which this token does not carry. A **403**
   * rather than a 401: the token is real and the board is saying what it may
   * do, which is a different fact from "who are you".
   */
  const me = await api.get('/me')
  expect(me.status()).toBe(403)

  const forums = await api.get('/forums')
  expect(forums.status()).toBe(200)
  const listed = (await forums.json()) as { data?: { id: number; title: string }[] }
  const rows = listed.data ?? (listed as unknown as { id: number; title: string }[])
  expect(JSON.stringify(rows)).toContain('General Discussion')

  /* Threads in a forum, and one thread's metadata. */
  const threads = await api.get('/forums/200/threads')
  expect(threads.status()).toBe(200)

  const thread = await api.get('/threads/4')
  expect(thread.status()).toBe(200)
  expect(JSON.stringify(await thread.json())).toContain('Version 0.1 is live')

  /* Posts need `posts:read`, which this token does not carry. */
  expect((await api.get('/threads/4/posts')).status()).toBe(403)

  /* And writing needs `posts:write`, which nothing here does. */
  expect((await api.post('/threads/4/posts', { message: 'no' })).status()).toBe(403)
})

test('a token that may read posts reads them, and search is its own scope', async ({
  page,
  request,
}) => {
  const token = await issueToken(page, `e2e posts ${Date.now().toString(36)}`, [
    'posts:read',
    'threads:read',
    'search:read',
  ])
  const api = bearer(request, token)

  const posts = await api.get('/threads/4/posts')
  expect(posts.status()).toBe(200)
  /*
   * The body arrives as **Markdown source**, not as the board's rendered HTML.
   * That is the API's contract and it is worth pinning: an API that shipped the
   * stored render would hand every consumer this board's smilies, its word
   * filters and its directive vocabulary as if they were content.
   */
  const body = JSON.stringify(await posts.json())
  /*
   * The Markdown is intact, asterisks and all — which is the assertion. A board
   * that shipped `message_html` here would send `<strong>` instead, and every
   * consumer would be parsing this board's rendering decisions.
   */
  expect(body).toContain('Welcome to the **new forum**')
  expect(body).not.toContain('<strong>')

  const search = await api.get('/search?q=version')
  expect(search.status()).toBe(200)
})

test('the API meters what a token spends, and says so in the headers', async ({ page, request }) => {
  const token = await issueToken(page, `e2e meter ${Date.now().toString(36)}`, ['forums:read'])
  const api = bearer(request, token)

  const first = await api.get('/forums')
  expect(first.status()).toBe(200)

  const limit = first.headers()['x-ratelimit-limit']
  const remaining = first.headers()['x-ratelimit-remaining']
  expect(limit, 'a metered API has to say what the ceiling is').toBeDefined()
  expect(remaining).toBeDefined()

  /*
   * Spent, not merely reported. A header that always says the same number is a
   * meter nobody is reading — and the endpoints have different costs, so
   * "remaining went down" is the only assertion that holds for all of them.
   */
  const second = await api.get('/forums')
  expect(Number(second.headers()['x-ratelimit-remaining'])).toBeLessThan(Number(remaining))
})

/**
 * A revoked token stops working, and stops working *immediately*.
 *
 * The half that a cached lookup gets wrong: revocation is the one operation an
 * operator performs under time pressure, and a token that keeps answering for a
 * minute afterwards is the difference between containing a leak and not.
 */
test('a revoked token is refused on the next request', async ({ page, request }) => {
  const name = `e2e revoke ${Date.now().toString(36)}`
  const token = await issueToken(page, name, ['forums:read'])
  const api = bearer(request, token)

  expect((await api.get('/forums')).status()).toBe(200)

  await page.goto('/admin/api-tokens')
  const row = page.getByRole('row', { name: new RegExp(name) })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: /Revoke/ }).click()

  /*
   * The row stays and its state changes — a revoked token is a fact an operator
   * needs to be able to see afterwards, so it is marked rather than deleted.
   */
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('revoked')

  const after = await api.get('/forums')
  expect(after.status()).toBe(401)
  /*
   * And the refusal is **the same sentence** a token that never existed gets.
   * This is the enumeration defence seen from the only side that can prove it:
   * a message that said "revoked" would confirm the token had once been real,
   * which is how a leaked token list gets sorted into live and dead.
   */
  expect(await refusal(after)).toBe('unauthenticated|That token is not valid.')
})

/**
 * The board's own pages are not the API, and the API is not a page.
 *
 * `robots.txt` disallows `/api` for a reason — these responses are JSON with no
 * canonical URL — and a route that answered HTML to a browser would be a second
 * rendering of the board with its own permission bugs.
 */
test('the API answers JSON, and an unknown endpoint is a 404 in JSON too', async ({
  page,
  request,
}) => {
  const token = await issueToken(page, `e2e shape ${Date.now().toString(36)}`, ['forums:read'])
  const api = bearer(request, token)

  const ok = await api.get('/forums')
  expect(ok.headers()['content-type']).toContain('application/json')

  const missing = await api.get('/not-an-endpoint')
  expect(missing.status()).toBe(404)
  expect(missing.headers()['content-type']).toContain('application/json')

  /*
   * A thread that does not exist is **403**, not 404 — and that is deliberate
   * rather than sloppy. The authorizer runs before existence is established, so
   * "there is no thread 999999" and "there is one and you may not read it" are
   * the same answer. A 404 here would make the API a directory of which private
   * threads exist.
   */
  const gone = await api.get('/threads/999999')
  expect(gone.status()).toBe(403)
  expect(gone.headers()['content-type']).toContain('application/json')
})
