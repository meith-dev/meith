import type { OpenApiDocument } from './openapi'

interface Endpoint {
  readonly method: string
  readonly path: string
  readonly scope: string
  readonly cost: number
  readonly summary: string
  readonly anonymous: boolean
}

function endpoints(document: OpenApiDocument): readonly Endpoint[] {
  const out: Endpoint[] = []

  for (const [path, operations] of Object.entries(document.paths)) {
    for (const [method, raw] of Object.entries(operations)) {
      const operation = raw as {
        summary: string
        security: readonly Record<string, unknown>[]
        'x-scope': string
        'x-rate-limit-cost': number
      }

      out.push({
        method: method.toUpperCase(),
        path,
        scope: operation['x-scope'],
        cost: operation['x-rate-limit-cost'],
        summary: operation.summary,
        anonymous: operation.security.some((option) => Object.keys(option).length === 0),
      })
    }
  }

  return out
}

export function renderReference(document: OpenApiDocument): string {
  const routes = endpoints(document)
  const scopes = Object.keys(document['x-scopes'])
  const anonymous = routes.filter((route) => route.anonymous)
  const window = document['x-rate-limit'] as {
    window: { seconds: number; budget: number }
    anonymousWindow: { seconds: number; budget: number }
  }

  const out: string[] = []
  const push = (...lines: string[]): void => {
    out.push(...lines)
  }

  push(
    '# REST API v1',
    '',
    '<!-- GENERATED FILE — do not edit. Run pnpm api:docs. -->',
    '',
    `${routes.length} endpoints, ${scopes.length} scopes. Base path: \`/api/v1\`.`,
    '',
    'Request/response schemas are in [`docs/reference/openapi.json`](openapi.json), also served at `/api/v1/openapi.json`.',
    '',
    '## Authentication',
    '',
    'Send a bearer token in the `Authorization` header:',
    '',
    '```text',
    'Authorization: Bearer forum_pat_<lookup>_<secret>',
    '```',
    '',
    'Each request checks the token scope and the owner’s current permissions. Tokens cannot grant access their owner lacks. Invalid, expired and revoked tokens return the same `401`; diagnostic details stay in server logs.',
    '',
    '## Reading without a token',
    '',
    `${anonymous.length} endpoints support guest reads. Guest permissions and content visibility apply. All writes require authentication.`,
    '',
    'An offline board returns `503` unless the authenticated owner may view it. Supplying a token requires the endpoint scope even when the endpoint supports guest access.',
    '',
    '| Method | Path |',
    '|---|---|',
    ...anonymous.map((route) => `| \`${route.method}\` | \`${route.path}\` |`),
    '',
    '## Scopes',
    '',
    ...scopes.map((scope) => `- \`${scope}\``),
    '',
    'There are no separate administration or moderation scopes. A content write still requires the owner’s applicable permissions. Retired scopes are removed when a stored token is read; remaining scopes continue to work.',
    '',
    '## Issuing a token',
    '',
    'Open **Admin → API tokens** and reauthenticate to issue a token. **Expires in (days)** accepts whole days or a blank value for no expiry. Revocation does not require reauthentication; revoked tokens cannot be restored.',
    '',
    '## Rate limits',
    '',
    `Authenticated budget: **${window.window.budget} units per ${window.window.seconds} seconds** per token.`,
    '',
    `Guest budget: **${window.anonymousWindow.budget} units per ${window.anonymousWindow.seconds} seconds** per address prefix.`,
    '',
    'Endpoint costs consume units. Metered responses include `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset`. A budget refusal returns `429` and `retry-after`. Board posting/flood limits also apply.',
    '',
    '## Endpoints',
    '',
    '| Method | Path | Scope | Cost | Token | Summary |',
    '|---|---|---|---|---|---|',
  )

  for (const route of routes) {
    push(
      `| \`${route.method}\` | \`${route.path}\` | \`${route.scope}\` | ${route.cost} | ` +
        `${route.anonymous ? 'optional' : 'required'} | ${route.summary} |`,
    )
  }

  push(
    '',
    '## Errors',
    '',
    '```json',
    '{ "error": { "code": "missing_scope", "message": "…", "requestId": "…" } }',
    '```',
    '',
    'Use `code` for handling, `message` for display and `requestId` to locate server logs.',
    '',
    '| Status | Code | Meaning |',
    '|---|---|---|',
    '| 400 | `bad_request` | Missing or invalid query parameter |',
    '| 401 | `unauthenticated` | Missing or invalid token |',
    '| 403 | `missing_scope` | Required scope absent |',
    '| 403 | `owner_unavailable` | Token owner cannot act |',
    '| 404 | `no_such_route` | Unknown endpoint |',
    '| 404 | `not_found` | Resource missing or hidden |',
    '| 429 | `rate_limited` | API budget exceeded |',
    '| 501 | `not_implemented` | Registered endpoint has no handler |',
    '| 503 | `board_offline` | Board unavailable to this caller |',
    '| 403 | `FORBIDDEN` | Domain permission denied |',
    '| 404 | `NOT_FOUND` | Domain resource missing |',
    '| 409 | `CONFLICT` | Conflicting state |',
    '| 422 | `VALIDATION` | Domain input/posting rule failed |',
    '| 429 | `RATE_LIMITED` | Board flood limit exceeded |',
    '',
    'Hidden resources return `404`; a visible resource can return `403` for an action the owner cannot perform. Domain messages use the board language.',
    '',
    '## Webhooks',
    '',
    'Follow [Webhooks](../integrations/webhooks.md) to subscribe, verify signatures, deduplicate deliveries and handle retries.',
    '',
  )

  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}
