import { type APIRequestContext, expect, type Page, test } from '@playwright/test'

import { enterAdminPanel } from './support/session'

async function issueToken(page: Page, name: string, scopes: readonly string[]): Promise<string> {
  await enterAdminPanel(page)
  await page.goto('/admin/api-tokens')

  await page.getByLabel('Name').fill(name)
  for (const scope of scopes) {
    await page.getByRole('checkbox', { name: scope, exact: true }).check()
  }
  await page.getByRole('button', { name: 'Issue token' }).click()

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

async function refusal(response: { json: () => Promise<unknown> }): Promise<string> {
  const { error } = (await response.json()) as { error: { code: string; message: string } }
  return `${error.code}|${error.message}`
}

test('an endpoint that needs a token refuses every request without a usable one', async ({
  request,
}) => {
  const unnamed = await Promise.all([
    request.get('/api/v1/me'),
    request.get('/api/v1/subscriptions'),
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

test('a stranger with no token reads the public board and cannot write to it', async ({
  request,
}) => {
  const forums = await request.get('/api/v1/forums')
  expect(forums.status()).toBe(200)
  expect(JSON.stringify(await forums.json())).toContain('General Discussion')

  const thread = await request.get('/api/v1/threads/4')
  expect(thread.status()).toBe(200)
  expect(JSON.stringify(await thread.json())).toContain('Version 0.1 is live')

  const posts = await request.get('/api/v1/threads/4/posts')
  expect(posts.status()).toBe(200)
  expect(JSON.stringify(await posts.json())).toContain('Welcome to the **new forum**')

  expect(
    forums.headers()['x-ratelimit-limit'],
    'an unauthenticated caller is metered too, and told so',
  ).toBeDefined()

  const write = await request.post('/api/v1/threads/4/posts', { data: { message: 'no' } })
  expect(write.status(), 'nothing writable answers a stranger').toBe(401)

  const own = await request.get('/api/v1/me')
  expect(own.status(), 'there is no owner to describe without a token').toBe(401)
})

test('a token still narrows what its owner may reach, even where a stranger may read', async ({
  page,
  request,
}) => {
  const token = await issueToken(page, `e2e narrow ${Date.now().toString(36)}`, ['threads:read'])
  const api = bearer(request, token)

  expect((await request.get('/api/v1/forums')).status(), 'the stranger may').toBe(200)
  expect((await api.get('/forums')).status(), 'this token may not').toBe(403)
})

test('a token reaches what its scopes allow and nothing else', async ({ page, request }) => {
  const token = await issueToken(page, `e2e read ${Date.now().toString(36)}`, [
    'forums:read',
    'threads:read',
  ])
  const api = bearer(request, token)

  const me = await api.get('/me')
  expect(me.status()).toBe(403)

  const forums = await api.get('/forums')
  expect(forums.status()).toBe(200)
  const listed = (await forums.json()) as { data?: { id: number; title: string }[] }
  const rows = listed.data ?? (listed as unknown as { id: number; title: string }[])
  expect(JSON.stringify(rows)).toContain('General Discussion')

  const threads = await api.get('/forums/200/threads')
  expect(threads.status()).toBe(200)

  const thread = await api.get('/threads/4')
  expect(thread.status()).toBe(200)
  expect(JSON.stringify(await thread.json())).toContain('Version 0.1 is live')

  expect((await api.get('/threads/4/posts')).status()).toBe(403)

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
  const body = JSON.stringify(await posts.json())
  expect(body).toContain('Welcome to the **new forum**')
  expect(body).not.toContain('<strong>')

  const search = await api.get('/search?q=version')
  expect(search.status()).toBe(200)
})

test('the API meters what a token spends, and says so in the headers', async ({
  page,
  request,
}) => {
  const token = await issueToken(page, `e2e meter ${Date.now().toString(36)}`, ['forums:read'])
  const api = bearer(request, token)

  const first = await api.get('/forums')
  expect(first.status()).toBe(200)

  const limit = first.headers()['x-ratelimit-limit']
  const remaining = first.headers()['x-ratelimit-remaining']
  expect(limit, 'a metered API has to say what the ceiling is').toBeDefined()
  expect(remaining).toBeDefined()

  const second = await api.get('/forums')
  expect(Number(second.headers()['x-ratelimit-remaining'])).toBeLessThan(Number(remaining))
})

test('a revoked token is refused on the next request', async ({ page, request }) => {
  const name = `e2e revoke ${Date.now().toString(36)}`
  const token = await issueToken(page, name, ['forums:read'])
  const api = bearer(request, token)

  expect((await api.get('/forums')).status()).toBe(200)

  await page.goto('/admin/api-tokens')
  const row = page.getByRole('row', { name: new RegExp(name) })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: /Revoke/ }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()

  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('revoked')

  const after = await api.get('/forums')
  expect(after.status()).toBe(401)
  expect(await refusal(after)).toBe('unauthenticated|That token is not valid.')
})

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

  const gone = await api.get('/threads/999999')
  expect(gone.status()).toBe(403)
  expect(gone.headers()['content-type']).toContain('application/json')
})
