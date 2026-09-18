# Enable browser notifications

Enable web push for members who choose browser notifications. Configure the board first; each member must then opt in on their device.

## Web push

A pushed notification reaches a member who does not have the board open —
the operating system's own notification, raised on a phone or laptop
doing something else. The same machinery makes the board installable: a
board that can push and sit on a home screen is treated as an
application by the browsers, and on iOS it must be installed before it
may push at all. Push is off until an operator turns it on, and then off
for every member until they turn it on themselves, per browser. There is
no way to be pushed at by accident.

### What it costs a member's privacy

A push travels from the board to **a push service run by the browser's
maker** — Google for Chrome, Mozilla for Firefox, Apple for Safari — and
from there to the device; there is no version of the standard where a
board reaches a sleeping phone by itself. The push service learns that
this board sent something to this endpoint, and when — nothing about
what it said (the payload is encrypted end to end,
[RFC 8291](https://www.rfc-editor.org/rfc/rfc8291), to a key only the
browser holds) and nothing about who the member is (an endpoint is an
opaque URL the browser minted). The board tells each member this on the
preferences screen before they subscribe; repeat it in your privacy
policy if your members would want it there.

### Turning it on

1. **Generate a VAPID key pair**
   ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)) — the public
   half every browser stores when it subscribes, the private half signs
   every send:

   ```sh
   docker compose run --rm web meith push:keys           # prints a pair to paste in
   docker compose run --rm web meith push:keys --save    # generates and stores it
   ```

   > [!WARNING]
   > Replacing a key pair that is already in use kills every stored
   > subscription: the browsers hold the old public key and the push
   > services will refuse the new signature. Each member's browser
   > resubscribes on its next visit to the preferences screen, and until
   > then they are pushed nothing. Generate once.

2. **Fill in the settings** at `/admin/settings?group=push`:

   | Setting | What it does |
   |---|---|
   | **Offer web push** | Off by default. On, members get a subscribe button on `/notifications/preferences` and a push column beside the e-mail one. |
   | **VAPID public key** | The half every browser stores. |
   | **VAPID private key** | The half that signs. Stored on the board, like the SMTP password. |
   | **Contact for the push service** | A `mailto:` or `https:` address a push service can use to reach you. Left empty, the board sends the mail-from address, and failing that its own https address. With none of the three, push stays off, and the settings screen says so. |

3. **Serve the board over HTTPS.** A service worker will not register
   over plain HTTP, and without one there is no push and no install.
   `localhost` is exempt, which is why development works without a
   certificate.

### What a member does

On `/notifications/preferences`, a member subscribes the browser they
are holding, ticks a push box per notification kind (independent of the
e-mail box beside it), and can remove the subscription again. Every
browser is subscribed separately — the subscription belongs to the
browser, the per-kind preferences to the account. The subscribe button
is the one part of the board that needs JavaScript to be useful, because
a page cannot ask a browser for a push subscription in a form post;
everything else on the screen is an ordinary no-JS form.

On iPhone and iPad, Safari pushes only to a board that has been **added
to the home screen**. Until then the subscribe button is refused by the
browser; the board reports the refusal rather than pretending it worked,
though Safari does not say the home-screen rule was the reason.

### How a push is sent

The path is the one notification mail already takes, with a second
handler at the end: `raise()` writes the notification, an outbox row is
written only when somebody wants the mail or the push, and the tick
relays it to the `notifications.email` and `notifications.push` queue
jobs — separate jobs, so a push service being down does not hold up the
mail. A coalesced notification pushes nothing, on the same rule as mail;
`push_sent_at` guards against a double send, exactly as `email_sent_at`
does. Failures retry through the queue, and a push service answering
`404` or `410` means the browser is gone for good — that subscription is
pruned. The payload carries the notification's rendered subject and
body in the member's own language, its id, the link it points at, and
the member's unread count for the app badge — capped well under the 4 KB
a push service will carry.

One member's devices are pushed a few at a time rather than strictly one
after another, so a single slow or hostile push service cannot hold up
the rest of the batch; each request still carries the deadline, response
cap and abort described under [the outbound address
policy](mail.md#private-relays-and-outbound-requests). A member may register up to twenty
push subscriptions; a browser re-subscribing an endpoint it already holds
replaces that one rather than counting against the cap, but a twenty-first
distinct browser is refused until one is removed.

### The service worker and the manifest

`public/sw.js` shows a notification when one is pushed and opens or
focuses the right page when one is clicked, exactly as before. A click
deep-links to the notification's own target and falls back to
`/notifications`; off-origin links are refused.

Its only other job is a navigation fallback for an installed board that
opens with no connection. The `fetch` handler intercepts top-level navigation
requests alone (`request.mode === 'navigate'` and `request.destination === 'document'`)
and always tries the
network first; it only steps in when that request fails outright,
serving a precached, static `/offline` page instead of the browser's own
error screen. Nothing else is cached or intercepted — the board's actual
pages, its API responses, and its assets all still go straight to the
network on every request. That restraint is deliberate: a cached page
served to a signed-in member is a page with somebody else's name in the
header, so the fallback carries no session state at all — the board's
name, a short "you're offline" message, and a link that retries once the
connection is back. `/offline` has no data dependency of its own for the
same reason: it is a static route, styled with its own inlined copy of
the default design tokens rather than the board's stylesheet, so it
renders correctly with nothing else in cache.

The offline page is precached once, at `install`, into a cache keyed by
a version baked into `sw.js` (`meith-offline-v1`); `activate` deletes any
differently-versioned copy left over from a previous deploy. A deploy
that changes `sw.js` — bumping that version or not — always refetches
`/offline` fresh at install time, so the cached fallback never drifts far
from what a deploy last shipped. Every step here is wrapped so a failure
falls back to a plain network request rather than breaking navigation:
a service worker that throws on `fetch` can brick every reader until it
updates, which is the one failure mode worth designing around.

Two limitations follow from keeping this minimal. First, `/offline` is
English-only by design — it has no data dependency of its own, and
reading the viewer's locale is exactly the kind of dependency it avoids,
so a non-English board still shows an English offline screen. Second,
the `install`-time precache does not retry: if the very deploy that
changes `sw.js` also happens to fail the fetch for `/offline` (a flaky
network at that moment, not the reader being offline — the deploy itself
needed a network to have reached the browser at all), that install
proceeds with no cached fallback until the next deploy tries again. Until
then, a reader who goes offline sees the browser's own error page rather
than this one — the pre-existing behaviour, not a new failure.

`/manifest.webmanifest` is generated per request from the board's own
settings, so the installed application carries the board's name,
description and theme colour and follows them when they change. It is
served whether or not push is on.

### When push does not work

| What you see | What it is |
|---|---|
| No subscribe button at all | **Offer web push** is off, or the keys or the contact are missing. With push on and something missing, `/admin/settings?group=push` says which. |
| The button appears and the browser refuses | Notifications are blocked in the browser's own site settings — or, on iOS, the board is not on the home screen yet. |
| Subscribed, and nothing arrives | Check the worker is running: push goes out on the **tick**, like notification mail. `meith task:list` shows when the outbox last relayed. |
| It worked and then stopped, on one device | The push service dropped the endpoint and the board pruned it. The member resubscribes from the preferences screen. |
| It worked and then stopped, for everybody | The VAPID key pair changed. See the warning above. |
| Nothing on iOS, everything elsewhere | Safari pushes only to an installed board. |

What is stored: `push_subscriptions` holds one row per subscribed
browser — the endpoint, the browser's two keys, the member, and when it
was last successfully pushed to — deleted with the member, deleted when
the push service says the endpoint is gone, and moved to the surviving
account on a merge. `notification_preferences` gains a nullable `push`
column beside `email` (null means the registry's default for that kind),
and `notifications` gains `push_sent_at`. Nothing here is readable by
anybody but the board.
