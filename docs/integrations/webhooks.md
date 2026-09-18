# Receive and verify webhooks

Send board events to an HTTPS endpoint you operate. Deliveries are queued, signed and retried. You need administrator access to create a subscription and a receiver that can verify raw request bytes.

## Create a subscription

Open **Admin → Webhooks**, enter the endpoint and choose at least one topic. Select Plain JSON for your own integration or the Discord format for a channel webhook. Enable delivery when the receiver is ready.

Copy the signing secret when shown; it is displayed once. Store it in the receiver's secret configuration. Inspect Recent deliveries after triggering a controlled event.

## Choose topics and understand visibility

| Topic | Event |
|---|---|
| `thread.created` | A thread is created visible |
| `post.created` | A first post or reply is created visible |
| `post.edited` | A visible post is edited and remains visible |
| `post.deleted` | A previously visible post is removed |
| `user.registered` | An interactive registration or administrator-created account |
| `report.created` | Content is reported |

Held content does not emit a creation event. Later approval and restoration do not re-emit creation. An edit that returns content to approval is quiet. Bulk import and fixture loading do not emit one registration event per member.

Payloads contain event identifiers, not complete database rows. Fetch authorized details through the [REST API](../reference/api.md). A report includes its target kind and ID; a guest reporter can have a null ID.

## Verify the request

| Header | Purpose |
|---|---|
| `x-forum-event` | Topic |
| `x-forum-delivery` | Stable delivery ID for deduplication across retries |
| `x-forum-timestamp` | Unix seconds included in the signature |
| `x-forum-signature` | `sha256=<hex>` HMAC of `<timestamp>.<raw body>` |

Verify before parsing or processing the body. Reject stale timestamps and compare signatures in constant time. This Node.js example expects the raw body as a Buffer and string-valued headers:

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verify(secret, headers, rawBody, now = Math.floor(Date.now() / 1000)) {
  const rawTimestamp = headers['x-forum-timestamp']
  if (typeof rawTimestamp !== 'string' || !/^\d+$/.test(rawTimestamp)) return false
  const timestamp = Number(rawTimestamp)
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300) return false
  const signature = headers['x-forum-signature']
  if (typeof signature !== 'string') return false
  const expected = `sha256=${createHmac('sha256', secret)
    .update(`${rawTimestamp}.`)
    .update(rawBody)
    .digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

Deduplicate using the delivery ID before applying a side effect. Signature verification establishes authenticity; it does not itself make processing idempotent. The Discord format is handled by Discord rather than your own signature receiver.

## Handle retries

The `webhooks.deliver` task retries timeouts, connection failures, 5xx, 408 and 429 responses, backing off from 30 seconds up to an hour, for up to six attempts. Other 4xx responses are treated as permanent failures. Inspect retrying and dead-lettered deliveries in the panel.

The endpoint must resolve to an allowed public address. Production private-network delivery requires the explicit `WEBHOOK_ALLOW_PRIVATE_HOSTS` configuration; use it only for an intended internal endpoint.

If deliveries stop, check [Scheduled tasks](../operations/scheduled-tasks.md), endpoint responses and subscription state. Pausing a subscription retains history but stops new deliveries.
