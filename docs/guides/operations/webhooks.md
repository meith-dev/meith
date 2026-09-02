# Webhooks

Deliver board events to an endpoint of your choosing. A new thread, a new
post, an edit, a deletion, a registration or a report becomes an HTTP `POST`
to a URL you control — signed, queued, and retried with backoff. Nothing is
sent from the request that caused the event, so a slow or unreachable
endpoint never delays a member.

## Creating a subscription

Under **Admin → Webhooks**:

| Field | What it is |
|---|---|
| Endpoint | The `https://` address each event is posted to. Plain `http://` is refused. |
| Topics | The events this endpoint receives (see the list below). At least one is required. |
| Payload format | **Plain JSON** posts the event and its ids, signed. **Discord** posts a message with a link, for a Discord channel webhook URL. |
| Deliver events | The active toggle. A paused subscription keeps its history but receives nothing. |

Adding a subscription generates a **signing secret** and shows it once. Copy
it then: every plain-JSON delivery is signed with it, and it is what your
receiver checks a delivery against.

The **Recent deliveries** panel on each subscription shows what happened to
the last deliveries — delivered, still pending or retrying, or given up on —
with the last status code or error.

## Topics

| Topic | Fires when |
|---|---|
| `thread.created` | A new thread is created **visible** — one held for approval does not fire it. |
| `post.created` | A new post (a reply, or a thread's first post) is created **visible**. |
| `post.edited` | A visible post is edited and stays visible. |
| `post.deleted` | A post that was **visible** is removed. |
| `user.registered` | An account is created through registration or the admin. |
| `report.created` | A member reports content. |

### The visibility contract

A subscriber only ever hears about content it could have received a
`post.created` (or `thread.created`) for. Content held for approval, and the
approval and restore moments themselves, are deliberately quiet:

- `thread.created` and `post.created` fire the moment content is created
  **visible**. A thread or post held for approval fires nothing on creation.
- **A held post that is later approved does not emit `post.created`** — the
  approval is a `post.visibility_changed` internally, not a creation. Treat
  the absence of a delivery as "not visible yet", not as "never posted".
- `post.edited` fires only while the post is visible. An edit that sends a
  post back for approval, or an edit to an already-unapproved post, fires
  nothing.
- `post.deleted` fires only when the post being removed was visible. Deleting
  an unapproved post — one no subscriber was told about — fires nothing.
- **Restoring a deleted post does not re-emit `post.created`.**

### What the ids mean

- `report.created` carries `targetKind`, one of `post`, `thread`, `user` or
  `private_message`, with the matching `targetId`. `reporterId` is `null` for
  a report filed by a guest.
- `user.registered` is emitted for an account created interactively —
  registration or an administrator adding a member. **Bulk import and the
  demo-board seed do not emit it**, so restoring a backup or reseeding a demo
  board does not flood every subscriber with one delivery per member.

## Payload format

A **plain JSON** body carries the event name and its ids — never whole rows.
A receiver that needs the full thread or post fetches it through the
[REST API](../../reference/api.md). A `post.created` delivery looks like:

```json
{
  "event": "post.created",
  "postId": 4102,
  "threadId": 87,
  "forumId": 3,
  "authorId": 12,
  "url": "https://board.example/threads/87#post-4102"
}
```

A **Discord** body is what a Discord channel webhook expects — a `content`
field with a link to the thread or post. Discord ignores the signature
headers; the other formats are verified as below.

## Headers

Every delivery carries four headers:

| Header | Meaning |
|---|---|
| `x-forum-event` | The topic. |
| `x-forum-delivery` | The delivery id — stable across retries, so de-duplicate on it. |
| `x-forum-timestamp` | Unix seconds, and part of the signed material. |
| `x-forum-signature` | `sha256=<hex>` of `HMAC-SHA256(secret, "<timestamp>.<body>")`. |

## Verifying a delivery

Recompute the signature over the raw body and compare it in constant time.
Reject a timestamp too far from your own clock — that is what makes a
captured delivery unreplayable.

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verify(secret, headers, rawBody, nowSeconds = Math.floor(Date.now() / 1000)) {
  const timestamp = Number(headers['x-forum-timestamp'])
  if (Math.abs(nowSeconds - timestamp) > 300) return false

  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`
  const presented = headers['x-forum-signature'] ?? ''
  const a = Buffer.from(expected)
  const b = Buffer.from(presented)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

Recompute over the exact bytes you received, before any JSON parsing
re-serialises them.

## Delivery, retries and dead-lettering

Delivery is queued and drained by the `webhooks.deliver` scheduled task,
never sent inline. A delivery is retried on a timeout, a refused connection,
a 5xx, a 408 or a 429, backing off from 30 seconds and doubling to an hour,
up to six attempts. Any other 4xx is treated as permanent and given up on
immediately — a `410 Gone` is dead-lettered at once. Dead-lettered and
retrying deliveries are visible in the subscription's delivery log.

The task runs on the worker (or over HTTP where there is no worker — see
[Monitoring](./monitoring.md#driving-the-tick-over-http)). Outbound requests
go through the board's outbound guard: the endpoint must resolve to a public
address, and a name that resolves to a private one is refused. In
development the guard allows private hosts; in production set
`WEBHOOK_ALLOW_PRIVATE_HOSTS=1` only if you deliberately deliver to an
internal address. Each attempt runs against a wall-clock deadline and reads
only a bounded response, so a slow or hostile subscriber cannot hold the
delivery task open — see [the outbound address
policy](./operating.md#outbound-address-policy).
