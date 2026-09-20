# REST API v1

<!-- GENERATED FILE — do not edit. Run pnpm api:docs. -->

21 endpoints, 13 scopes. Base path: `/api/v1`.

Request/response schemas are in [`docs/reference/openapi.json`](openapi.json), also served at `/api/v1/openapi.json`.

## Authentication

Send a bearer token in the `Authorization` header:

```text
Authorization: Bearer forum_pat_<lookup>_<secret>
```

Each request checks the token scope and the owner’s current permissions. Tokens cannot grant access their owner lacks. Invalid, expired and revoked tokens return the same `401`; diagnostic details stay in server logs.

## Reading without a token

7 endpoints support guest reads. Guest permissions and content visibility apply. All writes require authentication.

An offline board returns `503` unless the authenticated owner may view it. Supplying a token requires the endpoint scope even when the endpoint supports guest access.

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

There are no separate administration or moderation scopes. A content write still requires the owner’s applicable permissions. Retired scopes are removed when a stored token is read; remaining scopes continue to work.

## Issuing a token

Open **Admin → API tokens** and reauthenticate to issue a token. **Expires in (days)** accepts whole days or a blank value for no expiry. Revocation does not require reauthentication; revoked tokens cannot be restored.

## Rate limits

Authenticated budget: **600 units per 300 seconds** per token.

Guest budget: **120 units per 300 seconds** per address prefix.

Endpoint costs consume units. Metered responses include `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset`. A budget refusal returns `429` and `retry-after`. Board posting/flood limits also apply.

## Endpoints

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

```json
{ "error": { "code": "missing_scope", "message": "…", "requestId": "…" } }
```

Use `code` for handling, `message` for display and `requestId` to locate server logs.

| Status | Code | Meaning |
|---|---|---|
| 400 | `bad_request` | Missing or invalid query parameter |
| 401 | `unauthenticated` | Missing or invalid token |
| 403 | `missing_scope` | Required scope absent |
| 403 | `owner_unavailable` | Token owner cannot act |
| 404 | `no_such_route` | Unknown endpoint |
| 404 | `not_found` | Resource missing or hidden |
| 429 | `rate_limited` | API budget exceeded |
| 501 | `not_implemented` | Registered endpoint has no handler |
| 503 | `board_offline` | Board unavailable to this caller |
| 403 | `FORBIDDEN` | Domain permission denied |
| 404 | `NOT_FOUND` | Domain resource missing |
| 409 | `CONFLICT` | Conflicting state |
| 422 | `VALIDATION` | Domain input/posting rule failed |
| 429 | `RATE_LIMITED` | Board flood limit exceeded |

Hidden resources return `404`; a visible resource can return `403` for an action the owner cannot perform. Domain messages use the board language.

## Webhooks

Follow [Webhooks](../integrations/webhooks.md) to subscribe, verify signatures, deduplicate deliveries and handle retries.
