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
| `thread.created` | A new thread is posted. |
| `post.created` | A new post (reply or a thread's first post) is added. |
| `post.edited` | A post is edited. |
| `post.deleted` | A post is removed. |
| `user.registered` | An account is created. |
| `report.created` | A member reports content. |

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
internal address.
