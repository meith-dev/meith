# @meith/plugin-webhooks

New threads and replies, delivered to an endpoint of your choosing. A Discord
channel webhook URL works as it is; anything else can take plain, signed JSON.

## What it does

A `thread.created` or `post.created` hook writes one row into this plugin's
own queue. A task drains that queue every minute, posts each row to the
configured endpoint, and records what happened: delivered, retried with
backoff, or given up on. Nothing is sent from the request itself, so a slow
or unreachable endpoint never delays a member's post.

## Settings

Under **Admin → Plugins → Webhooks**:

| Setting | What it is |
|---|---|
| Endpoint | The `https://` address each event is posted to. Plain `http://` is refused. |
| Payload format | **Discord** posts a message with the thread's title and a link. **Plain JSON** posts the event and its ids. |
| What to send | New threads, or new threads and replies. |
| Board address | Where this board is reachable, used to build the links that are sent. |
| Signing secret | Signs each plain-JSON delivery. Discord does not use it. |

Each also reads an environment variable (`WEBHOOKS_ENDPOINT_URL`,
`WEBHOOKS_BOARD_URL`, `WEBHOOKS_SIGNING_SECRET`), which is how an operator
keeps the secret out of the database.

## Verifying a delivery

Plain-JSON deliveries carry three headers:

    x-meith-event      thread.created
    x-meith-timestamp  1700000000
    x-meith-signature  sha256=<hex>

The signature is `HMAC-SHA256(secret, "<timestamp>.<body>")` over the raw
body. Recompute it and compare in constant time; reject a timestamp too far
from your own clock, which is what makes a captured delivery unreplayable.

## Retries

A delivery is retried on a timeout, a refused connection, a 5xx, a 408 or a
429, backing off from 30 seconds and doubling to an hour, up to six
attempts. Any other 4xx is treated as permanent and given up on
immediately — a 404 from a deleted Discord webhook will not be fixed by
sending it again. The counts are on the plugin's status page.
