# REST API v1

<!--
  GENERATED FILE — do not edit.

  Written by scripts/api-docs.mjs from packages/api/src/{routes,tokens}.ts. Run
  `pnpm api:docs` after changing either; `pnpm verify` and CI run
  `pnpm api:docs:check` and fail when this file and the code disagree.
-->

7 endpoints, 8 scopes. Base path: `/api/v1`.

## Authentication

A bearer token in the `Authorization` header:

```
Authorization: Bearer forum_pat_<lookup>_<secret>
```

A token is a **restriction on an actor, never a grant to one**. Every request
resolves the owner’s permissions and asks the Authorizer, exactly as a page does,
*in addition to* checking the token’s scope. A token can therefore never reach
anything its owner could not; revoking the owner’s access revokes the token’s in
the same instant, because nothing is baked in at creation.

Every authentication failure is one `401` with one message. The reason — expired,
revoked, unknown, malformed — is in the board’s logs and not in the response:
telling a caller "expired" confirms the token was real.

## Scopes

- `forums:read`
- `threads:read`
- `threads:write`
- `posts:read`
- `posts:write`
- `members:read`
- `search:read`
- `admin:read`

There is deliberately no `admin:write`. A token is a long-lived string in
somebody’s CI configuration; reconfiguring a board should need a person at a
keyboard with the admin panel’s re-authentication in front of them.

## Rate limits

Metered in **units of work, not requests** — a search is not a forum listing, and
a limit that prices them the same invites the expensive call. Every response,
refused or not, carries `x-ratelimit-limit`, `x-ratelimit-remaining` and
`x-ratelimit-reset`; a refusal is `429` with `retry-after`.

## Endpoints

| Method | Path | Scope | Cost | Summary |
|---|---|---|---|---|
| `GET` | `/me` | `members:read` | 1 | The token’s owner, and the scopes this token carries. |
| `GET` | `/forums` | `forums:read` | 1 | Every forum the token’s owner may see, as a flat list with parent ids. |
| `GET` | `/forums/:forumId/threads` | `threads:read` | 1 | Threads in a forum, newest activity first, keyset-paged. |
| `GET` | `/threads/:threadId` | `threads:read` | 1 | One thread’s metadata. |
| `GET` | `/threads/:threadId/posts` | `posts:read` | 1 | Posts in a thread, oldest first, keyset-paged. |
| `POST` | `/threads/:threadId/posts` | `posts:write` | 5 | Post a reply. Subject to the same flood control and moderation as the web form. |
| `GET` | `/search` | `search:read` | 10 | Full-text search, filtered to what the token’s owner may read. |

## Errors

Every error is the same shape, so a client parses one thing:

```json
{ "error": { "code": "missing_scope", "message": "…", "requestId": "…" } }
```

`code` is stable and machine-readable; `message` is for a human reading a
terminal. `requestId` is the board’s correlation id — quote it in a report and an
operator can find the request in their logs.

| Status | Code | Meaning |
|---|---|---|
| 401 | `unauthenticated` | No bearer token, or the token is not valid. |
| 403 | `missing_scope` | Authenticated, but this token lacks the endpoint’s scope. |
| 403 | `owner_unavailable` | The account the token belongs to can no longer act. |
| 404 | `no_such_route` | No such endpoint. |
| 429 | `rate_limited` | Over the window budget. See `retry-after`. |
| 501 | `not_implemented` | Declared in the registry, handler not yet written. |

## Webhooks

The board POSTs a JSON body and four headers:

| Header | Meaning |
|---|---|
| `x-forum-event` | The topic. |
| `x-forum-delivery` | Stable across retries — de-duplicate on this. |
| `x-forum-timestamp` | Unix seconds, and part of the signed material. |
| `x-forum-signature` | `sha256=<hex>` of `HMAC(secret, "<timestamp>.<body>")`. |

Verify by recomputing the HMAC over `` `${timestamp}.${rawBody}` `` and comparing in
constant time — **and reject anything older than five minutes**. The timestamp is
inside the signed material precisely so it cannot be edited; checking the
signature without checking the age leaves every captured delivery replayable
forever.

Delivery is queued, never inline. Failures retry with exponential backoff and
jitter (30s doubling, capped at an hour, six attempts) and then **dead-letter**
rather than disappearing, so an operator can retry them once the receiver is
fixed. A `410 Gone` stops the retries immediately: the receiver has said the
endpoint is finished.
