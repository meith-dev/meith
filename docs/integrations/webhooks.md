# Webhooks

Requires administrator access and an HTTPS receiver. Plain JSON deliveries are signed and queued.

## Subscribe

1. Open **Admin → Webhooks**.
2. Enter the endpoint and select topics.
3. Choose Plain JSON for a custom receiver or Discord for a channel webhook.
4. Copy the signing secret when shown; it is displayed once. Store it in the receiver's secret configuration.
5. Enable delivery, trigger a test event and inspect Recent deliveries.

## Topics

| Topic | Trigger |
|---|---|
| `thread.created` | Visible thread created |
| `post.created` | Visible first post or reply created |
| `post.edited` | Visible post edited and still visible |
| `post.deleted` | Previously visible post removed |
| `user.registered` | Interactive or administrator-created account |
| `report.created` | Content reported |

Held content emits no creation event. Approval and restoration do not re-emit creation. Edits returning content to approval are quiet. Imports and fixtures do not emit registration events per member.

Payloads carry identifiers, not database rows. Fetch permitted details through the [API](../reference/api.md). Report payloads include target kind/ID; the guest reporter ID can be null.

## Verify deliveries

| Header | Value |
|---|---|
| `x-forum-event` | Topic |
| `x-forum-delivery` | Stable ID across retries |
| `x-forum-timestamp` | Unix seconds |
| `x-forum-signature` | `sha256=<hex>` HMAC over `<timestamp>.<raw body>` |

Verify raw bytes before parsing. Reject stale timestamps and use constant-time comparison. This Node.js example accepts a Buffer and string-valued headers:

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

Deduplicate by delivery ID before applying side effects. A valid signature does not prevent duplicate processing. Discord handles its own receiver format.

## Retries and failures

The `webhooks.deliver` task accepts 2xx responses as delivered. HTTP 410 and blocked destinations fail permanently. Network failures and other non-2xx responses retry, up to six attempts. Delays double from 30 seconds with ±25% jitter. Inspect retries and dead letters in the panel.

Destinations must resolve to allowed public addresses. `WEBHOOK_ALLOW_PRIVATE_HOSTS` explicitly permits intended internal endpoints in production.

If delivery stops, check the [scheduler](../operations/scheduled-tasks.md), receiver response and subscription state. Pausing retains history and stops new events being queued. Pending deliveries continue.
