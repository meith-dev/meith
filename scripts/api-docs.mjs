#!/usr/bin/env node
/**
 * F81 — the REST reference, generated from the registry that is the API.
 *
 * Third in the same family as the theme and hook references, and the reason is
 * strongest here: an API's documentation is read by people who cannot see the
 * source, on a board they do not run, and a stale endpoint list is not a
 * confusing document — it is a client that 404s in production.
 *
 * `pnpm verify` and CI run `--check`, so a route added, renamed or re-scoped
 * without its reference updated fails the build.
 *
 * Run: pnpm api:docs   ·   Check: pnpm api:docs:check
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const ROUTES_FILE = 'packages/api/src/routes.ts'
const TOKENS_FILE = 'packages/api/src/tokens.ts'
const OUTPUT_FILE = 'docs/rest-api.md'

function balancedBlock(source, from) {
  const start = source.indexOf('{', from)
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return { body: source.slice(start + 1, i), end: i }
    }
  }
  return null
}

function joinStringLiterals(fragment) {
  let out = ''
  for (let i = 0; i < fragment.length; i++) {
    if (fragment[i] !== "'") continue
    i++
    for (; i < fragment.length && fragment[i] !== "'"; i++) {
      if (fragment[i] === '\\') i++
      out += fragment[i]
    }
  }
  return out
}

async function readRoutes() {
  const source = await readFile(join(ROOT, ROUTES_FILE), 'utf8')
  const start = source.indexOf('export const ROUTES = [')
  const end = source.indexOf('] as const satisfies', start)
  if (start === -1 || end === -1) {
    throw new Error(`api-docs: could not find ROUTES in ${ROUTES_FILE}. Update this parser.`)
  }

  const body = source.slice(start, end)
  const routes = []
  let cursor = body.indexOf('[')

  for (;;) {
    const entry = balancedBlock(body, cursor)
    if (entry === null) break
    cursor = entry.end + 1

    const method = /method:\s*'(GET|POST)'/.exec(entry.body)
    const path = /path:\s*'([^']+)'/.exec(entry.body)
    const scope = /scope:\s*'([^']+)'/.exec(entry.body)
    const cost = /cost:\s*(\d+)/.exec(entry.body)
    const summaryAt = entry.body.indexOf('summary:')

    if (method === null || path === null || scope === null || cost === null || summaryAt === -1) {
      throw new Error(
        'api-docs: a ROUTES entry is missing method, path, scope, cost or summary — or ' +
          'this parser can no longer read them. A reference written from a partial parse ' +
          'is worse than none.',
      )
    }

    routes.push({
      method: method[1],
      path: path[1],
      scope: scope[1],
      cost: Number(cost[1]),
      summary: joinStringLiterals(entry.body.slice(summaryAt, entry.body.indexOf('cost:'))),
    })
  }

  if (routes.length === 0) throw new Error('api-docs: parsed no routes.')
  return routes
}

async function readScopes() {
  const source = await readFile(join(ROOT, TOKENS_FILE), 'utf8')
  const start = source.indexOf('export const SCOPES = [')
  const end = source.indexOf('] as const', start)
  if (start === -1 || end === -1) throw new Error('api-docs: could not read SCOPES.')

  const scopes = [...source.slice(start, end).matchAll(/'([a-z]+:[a-z]+)'/g)].map((m) => m[1])
  if (scopes.length === 0) throw new Error('api-docs: parsed no scopes.')
  return scopes
}

function render({ routes, scopes }) {
  const out = []
  const push = (...lines) => out.push(...lines)

  push(
    '# REST API v1',
    '',
    '<!--',
    '  GENERATED FILE — do not edit.',
    '',
    '  Written by scripts/api-docs.mjs from packages/api/src/{routes,tokens}.ts. Run',
    '  `pnpm api:docs` after changing either; `pnpm verify` and CI run',
    '  `pnpm api:docs:check` and fail when this file and the code disagree.',
    '-->',
    '',
    `${routes.length} endpoints, ${scopes.length} scopes. Base path: \`/api/v1\`.`,
    '',
    '## Authentication',
    '',
    'A bearer token in the `Authorization` header:',
    '',
    '```',
    'Authorization: Bearer community_pat_<lookup>_<secret>',
    '```',
    '',
    'A token is a **restriction on an actor, never a grant to one**. Every request',
    'resolves the owner’s permissions and asks the Authorizer, exactly as a page does,',
    '*in addition to* checking the token’s scope. A token can therefore never reach',
    'anything its owner could not; revoking the owner’s access revokes the token’s in',
    'the same instant, because nothing is baked in at creation.',
    '',
    'Every authentication failure is one `401` with one message. The reason — expired,',
    'revoked, unknown, malformed — is in the board’s logs and not in the response:',
    'telling a caller "expired" confirms the token was real.',
    '',
    '## Scopes',
    '',
    ...scopes.map((scope) => `- \`${scope}\``),
    '',
    'There is deliberately no `admin:write`. A token is a long-lived string in',
    'somebody’s CI configuration; reconfiguring a board should need a person at a',
    'keyboard with the admin panel’s re-authentication in front of them.',
    '',
    '## Rate limits',
    '',
    'Metered in **units of work, not requests** — a search is not a community listing, and',
    'a limit that prices them the same invites the expensive call. Every response,',
    'refused or not, carries `x-ratelimit-limit`, `x-ratelimit-remaining` and',
    '`x-ratelimit-reset`; a refusal is `429` with `retry-after`.',
    '',
    '## Endpoints',
    '',
    '| Method | Path | Scope | Cost | Summary |',
    '|---|---|---|---|---|',
  )

  for (const route of routes) {
    push(
      `| \`${route.method}\` | \`${route.path}\` | \`${route.scope}\` | ${route.cost} | ${route.summary} |`,
    )
  }

  push(
    '',
    '## Errors',
    '',
    'Every error is the same shape, so a client parses one thing:',
    '',
    '```json',
    '{ "error": { "code": "missing_scope", "message": "…", "requestId": "…" } }',
    '```',
    '',
    '`code` is stable and machine-readable; `message` is for a human reading a',
    'terminal. `requestId` is the board’s correlation id — quote it in a report and an',
    'operator can find the request in their logs.',
    '',
    '| Status | Code | Meaning |',
    '|---|---|---|',
    '| 401 | `unauthenticated` | No bearer token, or the token is not valid. |',
    '| 403 | `missing_scope` | Authenticated, but this token lacks the endpoint’s scope. |',
    '| 403 | `owner_unavailable` | The account the token belongs to can no longer act. |',
    '| 404 | `no_such_route` | No such endpoint. |',
    '| 429 | `rate_limited` | Over the window budget. See `retry-after`. |',
    '| 501 | `not_implemented` | Declared in the registry, handler not yet written. |',
    '',
    '## Webhooks',
    '',
    'The board POSTs a JSON body and four headers:',
    '',
    '| Header | Meaning |',
    '|---|---|',
    '| `x-community-event` | The topic. |',
    '| `x-community-delivery` | Stable across retries — de-duplicate on this. |',
    '| `x-community-timestamp` | Unix seconds, and part of the signed material. |',
    '| `x-community-signature` | `sha256=<hex>` of `HMAC(secret, "<timestamp>.<body>")`. |',
    '',
    'Verify by recomputing the HMAC over `` `${timestamp}.${rawBody}` `` and comparing in',
    'constant time — **and reject anything older than five minutes**. The timestamp is',
    'inside the signed material precisely so it cannot be edited; checking the',
    'signature without checking the age leaves every captured delivery replayable',
    'forever.',
    '',
    'Delivery is queued, never inline. Failures retry with exponential backoff and',
    'jitter (30s doubling, capped at an hour, six attempts) and then **dead-letter**',
    'rather than disappearing, so an operator can retry them once the receiver is',
    'fixed. A `410 Gone` stops the retries immediately: the receiver has said the',
    'endpoint is finished.',
    '',
  )

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

const routes = await readRoutes()
const scopes = await readScopes()
const generated = render({ routes, scopes })
const target = join(ROOT, OUTPUT_FILE)

if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8').catch(() => '')
  if (current !== generated) {
    console.error(
      `${OUTPUT_FILE} is out of date.\n\nThe API registry changed and its reference did not. ` +
        'Run `pnpm api:docs` and commit the result — this document is read by people who ' +
        'cannot see the source, and a stale endpoint list is a client that 404s.\n',
    )
    const a = current.split('\n')
    const b = generated.split('\n')
    const at = a.findIndex((line, i) => line !== b[i])
    console.error(`First difference at line ${at + 1}:`)
    console.error(`  on disk:   ${a[at] ?? '(end of file)'}`)
    console.error(`  generated: ${b[at] ?? '(end of file)'}`)
    process.exit(1)
  }
  console.log(`${OUTPUT_FILE} is up to date (${routes.length} endpoints).`)
} else {
  await writeFile(target, generated, 'utf8')
  console.log(`Wrote ${OUTPUT_FILE} — ${routes.length} endpoints, ${scopes.length} scopes.`)
}
