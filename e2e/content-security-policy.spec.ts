import { expect, test } from '@playwright/test'

const HEADER = 'content-security-policy'

function directive(policy: string, name: string): string {
  const found = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `))
  expect(found, `${name} in ${policy}`).toBeDefined()
  return found as string
}

test('every page is served under a nonce policy, and nothing is refused under it', async ({
  page,
}) => {
  const refusals: string[] = []
  page.on('console', (message) => {
    if (/refused to (execute|load|apply)/i.test(message.text())) refusals.push(message.text())
  })
  page.on('pageerror', (error) => refusals.push(String(error)))

  const response = await page.goto('/')
  const policy = response?.headers()[HEADER] ?? ''

  const scripts = directive(policy, 'script-src')
  expect(scripts).not.toContain("'unsafe-inline'")
  expect(scripts).toMatch(/'nonce-[A-Za-z0-9+/=]+'/)
  expect(scripts).toContain("'strict-dynamic'")

  await expect(
    page.getByLabel('Main').getByRole('link', { name: 'Version 0.1 is live' }),
  ).toBeVisible()
  expect(refusals).toEqual([])
})

test('the board’s own inline scripts are stamped with the request’s nonce', async ({
  request,
}) => {
  const response = await request.get('/')
  const nonce = /'nonce-([^']+)'/.exec(response.headers()[HEADER] ?? '')?.[1]
  expect(nonce).toBeTruthy()

  const html = await response.text()
  const stamped = [...html.matchAll(/<script[^>]*\snonce="([^"]*)"/g)].map((m) => m[1])

  expect(stamped.length).toBeGreaterThan(0)
  expect(new Set(stamped)).toEqual(new Set([nonce]))
  expect(html).toMatch(/<script[^>]*\snonce="[^"]*"[^>]*>\(function\(\)\{try\{/)
})

test('a fresh nonce is minted for every request', async ({ page }) => {
  const first = await page.goto('/')
  const second = await page.goto('/login')

  const of = (value: string | undefined) => /'nonce-([^']+)'/.exec(value ?? '')?.[1]

  expect(of(first?.headers()[HEADER])).toBeTruthy()
  expect(of(first?.headers()[HEADER])).not.toBe(of(second?.headers()[HEADER]))
})

test('the policy reaches the paths the board serves outside a page render', async ({
  request,
}) => {
  for (const path of ['/robots.txt', '/feed.xml']) {
    const response = await request.get(path)
    expect(response.headers()[HEADER], path).toContain("object-src 'none'")
  }
})
