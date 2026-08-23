# REST API v1

<!--
  GENERATED FILE — do not edit.

  Written by scripts/api-docs.mts from the OpenAPI document the board serves,
  which is itself generated from packages/api/src/{routes,schema,tokens}.ts. Run
  `pnpm api:docs` after changing any of them; `pnpm verify` and CI run
  `pnpm api:docs:check` and fail when this file, docs/openapi.json and the code
  disagree.
-->

21 endpoints, 13 scopes. Base path: `/api/v1`.

The machine-readable form of everything below — request and response schemas,
parameters, status codes, scopes and rate-limit costs — is the OpenAPI 3 document
at [`docs/openapi.json`](openapi.json), which a board also serves live at
`/api/v1/openapi.json`. Point a generator at that rather than reading this table
into code.

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

## Reading without a token

7 of the 21 endpoints answer an unauthenticated request. They are all reads,
and they resolve as **the board’s guest** — the same actor a logged-out browser
gets — through the same Authorizer and the same visibility filter as every other
request. A forum a guest may not see is not in `GET /forums` for them, its threads
404, and its posts never appear in search. A board whose forums are all closed to
guests therefore has no anonymous API surface at all, without anything having to
be configured for that to be true.

An offline board answers `503` to an anonymous caller, exactly as it serves the
offline page to a browser, and answers normally to a token whose owner may see a
board that is offline.

Sending a token to one of these endpoints is not the same as sending none: the
token’s scope is still required, because a token only ever narrows what its
owner could do. A token without `forums:read` gets `missing_scope` from
`GET /forums` even though a stranger with no token at all gets an answer.

Nothing writable is anonymous. Every write is `401` without a token.

| Method | Path |
|---|---|
| `GET` | `/forums` |
| `GET` | `/forums/{forumId}/threads` |
| `GET` | `/threads/{threadId}` |
| `GET` | `/threads/{threadId}/posts` |
| `GET` | `/members/{userId}` |
| `GET` | `/threads/{threadId}/poll` |
| `GET` | `/search` |

## Scopes

- `forums:read`
- `threads:read`
- `threads:write`
- `posts:read`
- `posts:write`
- `members:read`
- `messages:read`
- `messages:write`
- `polls:write`
- `reputation:write`
- `subscriptions:read`
- `subscriptions:write`
- `search:read`

Every scope on that list is required by at least one endpoint below, and a test
holds it that way: a scope no route consumes is a checkbox that grants nothing,
which reads as a permission and is not one.

There is deliberately no administrative scope at all. A token is a long-lived
string in somebody’s CI configuration; reconfiguring a board should need a person
at a keyboard with the admin panel’s re-authentication in front of them. For the
same reason there is no moderation scope: removing somebody else’s post through
the API is `posts:write` resolving to a moderator’s own permissions, not a
separate grant a token can carry on its own.

A token stored before a scope was retired keeps working. The scope is dropped as
the token is read, so it simply no longer carries it — the endpoints it still has
a scope for answer as before, and the rest answer `missing_scope`.

## Issuing a token

Tokens are issued from **API tokens** in the control panel. Issuing one is treated
as a destructive operation: it asks for the administrator’s password again, on the
same clock as banning a member or moving a forum, because a bearer string that
leaves the building is at least as consequential. Revoking one does
not ask — a revocation is the thing you want to be quick during an incident, and
it is undone by issuing a new token rather than by recovering the old one.

**Expires in (days)** takes a whole number of days, or nothing at all for a token
that never expires. Anything else — a fraction, a word, a number in exponent
notation — is refused and mints nothing, rather than being read as "never".

## Rate limits

Metered in **units of work, not requests** — a search is not a forum listing, and
a limit that prices them the same invites the expensive call. Every response,
refused or not, carries `x-ratelimit-limit`, `x-ratelimit-remaining` and
`x-ratelimit-reset`; a refusal is `429` with `retry-after`.

A token spends against **600 units per 300 seconds**, held against the token. An
unauthenticated caller has no token to hold a budget against, so theirs is held
against their address prefix and is smaller: **120 units per 300 seconds**. The
board’s ordinary anti-flood limits apply to writes on top of both, exactly as they
do to the web forms.

## Endpoints

Full schemas for every request and response are in the OpenAPI document; this
table is the map.

| Method | Path | Scope | Cost | Token | Summary |
|---|---|---|---|---|---|
| `GET` | `/me` | `members:read` | 1 | required | The token’s owner, and the scopes this token carries. |
| `GET` | `/forums` | `forums:read` | 1 | optional | Every forum the caller may see, as a flat list with parent ids. |
| `GET` | `/forums/{forumId}/threads` | `threads:read` | 1 | optional | Threads in a forum, newest activity first, keyset-paged. |
| `POST` | `/forums/{forumId}/threads` | `threads:write` | 10 | required | Start a thread. Subject to the same flood control, approval queue and word limits as the web form. |
| `GET` | `/threads/{threadId}` | `threads:read` | 1 | optional | One thread’s metadata. |
| `GET` | `/threads/{threadId}/posts` | `posts:read` | 1 | optional | Posts in a thread, oldest first, keyset-paged. |
| `POST` | `/threads/{threadId}/posts` | `posts:write` | 5 | required | Post a reply. Subject to the same flood control and moderation as the web form. |
| `PATCH` | `/threads/{threadId}/posts/{postId}` | `posts:write` | 5 | required | Edit a post. The owner’s permissions decide whether that is their own post, anybody’s, and whether the edit window has closed. |
| `DELETE` | `/threads/{threadId}/posts/{postId}` | `posts:write` | 5 | required | Remove a post. This is the board’s soft delete — the same one the web form performs, recoverable by a moderator. |
| `GET` | `/members/{userId}` | `members:read` | 1 | optional | A member’s public profile. |
| `POST` | `/members/{userId}/reputation` | `reputation:write` | 5 | required | Rate a member, optionally against one of their posts. The board’s reputation settings decide whether negative points and empty comments are allowed. |
| `GET` | `/messages` | `messages:read` | 1 | required | One folder of the caller’s private messages. Listing marks nothing read. |
| `POST` | `/messages` | `messages:write` | 10 | required | Send a private message. Recipient quotas, ignore lists and the board’s message rate limits all apply. |
| `GET` | `/messages/{messageId}` | `messages:read` | 1 | required | One private message the caller is on. Opening it marks it read and, if the sender asked for a receipt, tells them. |
| `GET` | `/threads/{threadId}/poll` | `threads:read` | 1 | optional | A thread’s poll, with the running totals and the caller’s own vote. |
| `POST` | `/polls/{pollId}/votes` | `polls:write` | 5 | required | Vote in a thread’s poll. |
| `PATCH` | `/polls/{pollId}` | `polls:write` | 5 | required | Edit a poll the caller wrote, or any poll they moderate. |
| `GET` | `/subscriptions` | `subscriptions:read` | 1 | required | Everything the caller follows, filtered to forums they may still see. |
| `POST` | `/subscriptions` | `subscriptions:write` | 2 | required | Follow a thread or a forum. |
| `DELETE` | `/subscriptions/{target}/{targetId}` | `subscriptions:write` | 2 | required | Stop following a thread or a forum. |
| `GET` | `/search` | `search:read` | 10 | optional | Full-text search, filtered to what the caller may read. Narrow it with `forum`, `by`, `when`, `in` and `show`, and order it with `sort`. |

## Errors

Every error is the same shape, so a client parses one thing:

```json
{ "error": { "code": "missing_scope", "message": "…", "requestId": "…" } }
```

`code` is stable and machine-readable; `message` is for a human reading a
terminal. `requestId` is the board’s correlation id — quote it in a report and an
operator can find the request in their logs.

The API refuses a request before it reaches the board with these:

| Status | Code | Meaning |
|---|---|---|
| 400 | `bad_request` | A query parameter was missing or unusable. |
| 401 | `unauthenticated` | No bearer token, or the token is not valid. |
| 403 | `missing_scope` | Authenticated, but this token lacks the endpoint’s scope. |
| 403 | `owner_unavailable` | The account the token belongs to can no longer act. |
| 404 | `no_such_route` | No such endpoint. |
| 404 | `not_found` | No such resource, or none this caller may see. |
| 429 | `rate_limited` | Over the window budget. See `retry-after`. |
| 501 | `not_implemented` | Declared in the registry, handler not yet written. |
| 503 | `board_offline` | The board is offline and this caller may not see it. |

Past that point a request is running the same domain command the web form runs,
so it fails the way the web form fails, with the board’s own error codes and the
message translated into the board’s language:

| Status | Code | Meaning |
|---|---|---|
| 403 | `FORBIDDEN` | The owner’s permissions do not allow this, whatever the token carries. |
| 404 | `NOT_FOUND` | The thing named in the request is not there. |
| 409 | `CONFLICT` | Something else changed underneath the request. |
| 422 | `VALIDATION` | The board’s posting rules refused the contents — too long, too soon, a subject missing. |
| 429 | `RATE_LIMITED` | Over one of the board’s anti-flood limits, which are separate from the API budget. |

A resource the caller may not see is `404`, never `403`. Telling a stranger that
a thread exists but is not for them is the same leak as showing it to them. A
`403` means the caller can see the thing and may not do this to it.

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
