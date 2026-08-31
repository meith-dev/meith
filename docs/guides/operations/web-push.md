# Web push and the installable board

A notification that reaches a member who does not have the board open.
Until now the board had two ways to tell somebody something: the
notification centre, which they have to visit, and e-mail, which they
have to read. Web push is the third — the operating system's own
notification, raised on a phone or a laptop that is doing something else
entirely.

The same change makes the board installable. A board that can push a
notification and sit on a home screen is close enough to an application
that the browsers treat it as one, and on iOS it must be installed
before it may push at all.

Push is off until an operator turns it on, and then off for every member
until they turn it on themselves, on each browser separately. There is
no way to be pushed at by accident.

## What it costs a member's privacy

A pushed notification does not travel from this board to the device. It
travels from this board to **a push service run by the browser's maker** —
Google for Chrome, Mozilla for Firefox, Apple for Safari — and from there
to the device. That is how the web push standard works, and there is no
version of it where a board reaches a sleeping phone by itself.

What the push service learns:

- That a board at this address sent something to this endpoint, and when.
- Nothing about what it said. The payload is encrypted end to end
  ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291)), with a key the
  browser generated and only the browser holds. The board encrypts to
  it; the push service carries the ciphertext.
- Nothing about who the member is. An endpoint is an opaque URL the
  browser minted.

The board tells each member this on the preferences screen, in those
words, before they subscribe. Say it again in your privacy policy if
your members would want it there — Meith cannot write that for you,
because which push services your members use is their decision and not
yours.

## Turning it on

### 1. Generate a key pair

The board identifies itself to a push service with a VAPID key pair
([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)) — an ECDSA P-256
key, whose public half every browser stores when it subscribes, and
whose private half signs every send.

```sh
meith push:keys           # prints a pair for you to paste in
meith push:keys --save    # generates one and writes it to the board
```

> [!WARNING]
> Replacing a key pair that is already in use kills every subscription
> stored against it. The browsers hold the old public key and the push
> services will refuse the new signature; each member's browser
> resubscribes on its next visit to the notification preferences screen,
> and until then they are pushed nothing. Generate once.

### 2. Fill in the settings

`/admin/settings?group=push`:

| Setting | What it does |
|---|---|
| **Offer web push** | Off by default. On, members get a subscribe button on `/notifications/preferences` and a push column beside the e-mail one. |
| **VAPID public key** | The half every browser stores. |
| **VAPID private key** | The half that signs. Stored on the board, like the SMTP password. |
| **Contact for the push service** | A `mailto:` or `https:` address a push service can use to reach you about traffic it does not like. Left empty, the board sends the mail-from address, and failing that its own address — but only if that address is an https one. With none of the three, push stays off, and the settings screen says so. |

### 3. Serve the board over HTTPS

A service worker will not register over plain HTTP, and without a
service worker there is no push and no install. `localhost` is exempt,
which is why development works without a certificate.

## What a member does

On `/notifications/preferences`:

1. **Push notifications to this browser.** The browser asks for
   permission, generates its own key pair, and subscribes. The board
   stores the endpoint and the two keys against the member's account.
2. **The push column.** Each kind of notification gets a push box beside
   its e-mail box, and the two are independent: mail about a private
   message and a push about a mention is an ordinary thing to want.
3. **Stop pushing to this browser** removes the subscription from both
   the board and the browser.

Every browser is subscribed separately, because the subscription belongs
to the browser rather than the account. A member on a laptop and a phone
subscribes twice and is pushed twice; the per-kind preferences are the
account's and apply to both.

The subscribe button is the only part of the board that needs
JavaScript to be useful, and it is the only part that could not work
without it — a page cannot ask a browser for a push subscription in a
form post. Everything else on the screen, the push column included, is
an ordinary no-JS form.

### On iPhone and iPad

Safari pushes only to a board that has been **added to the home screen**.
Until then the subscribe button is there and the browser refuses it; the
board reports the refusal rather than pretending it worked, though it
cannot tell you it was the home-screen rule that did it — Safari does not
say. The manifest is what makes "Add to Home Screen" produce something
that looks like an application rather than a bookmark.

## How a push is sent

The path is the one e-mail already takes, with a second handler at the
end of it:

```
raise() ─▶ notifications row ─▶ outbox row ─▶ tick relays it
                                                 │
                                     ┌───────────┴───────────┐
                             notifications.email     notifications.push
                                     │                       │
                                  a message          one send per device
```

- **The outbox row is written only when somebody wants something.** A
  notification nobody wants by mail and nobody wants by push writes no
  row and costs nothing beyond the notification itself.
- **A coalesced notification pushes nothing.** The same rule as mail: a
  dedupe key that bumps an existing unread notification does not raise a
  second interruption.
- **The two channels are separate queue jobs.** A push service being
  down does not hold up the mail, and a mail provider being down does
  not hold up the push.
- **`push_sent_at` is the guard against a double send**, exactly as
  `email_sent_at` is. It is stamped once at least one device took the
  push.
- **Failures retry, and dead subscriptions are pruned.** A push service
  answering `404` or `410` means the browser is gone for good — that row
  is deleted, the same discipline the API package applies to a
  dead-lettered webhook. Anything else is treated as temporary, and the
  job is retried by the queue.

The payload carries the notification's rendered subject and body — the
same text the notification centre shows, in the member's own language —
its id, the link it points at, and the member's unread count for the app
badge. It is capped well under the 4 KB a push service will carry.

## What the service worker does, and does not

`public/sw.js` is seventy-odd lines and has no `fetch` handler. It shows a
notification when one is pushed, and opens or focuses the right page
when one is clicked. It caches nothing and intercepts nothing.

That is deliberate. An offline shell is the part of a service worker
that breaks a board: a cached page served to a signed-in member is a
page with somebody else's name in the header, and a board that reads
correctly with JavaScript switched off should not become a board that
reads *wrongly* with a stale cache switched on. If Meith grows an
offline mode it will be a separate decision with its own document.

A click deep-links to the notification's own target — the post, the
thread, the private message — and falls back to `/notifications` when
the notification carried no link. Off-origin links are refused rather
than followed.

## The manifest

`/manifest.webmanifest` is generated per request from the board's own
settings, so the installed application carries the board's name, its
description and its theme colour, and follows them when they change. No
operator action is needed; it is served whether or not push is on.

## When it does not work

| What you see | What it is |
|---|---|
| No subscribe button at all | **Offer web push** is off, or the keys or the contact are missing. With push on and something missing, `/admin/settings?group=push` says which. |
| The button appears and the browser refuses | Notifications are blocked for the site — the member has to allow them in the browser's own site settings first. On iOS, the board is not on the home screen yet. |
| Subscribed, and nothing arrives | Check the worker is running: push goes out on the **tick**, like notification mail. `meith task:list` shows when the outbox last relayed. |
| It worked and then stopped, on one device | The push service dropped the endpoint and the board pruned it. The member resubscribes from the preferences screen. |
| It worked and then stopped, for everybody | The VAPID key pair changed. See the warning above. |
| Nothing on iOS, everything elsewhere | Safari pushes only to an installed board. |

## What is stored

| Table | Rows |
|---|---|
| `push_subscriptions` | One per subscribed browser: the endpoint, the browser's two keys, the member, when it was created and when it was last successfully pushed to. Deleted with the member, deleted when the push service says the endpoint is gone, and moved to the surviving account when two members are merged. |
| `notification_preferences` | Gains a `push` column beside `email`. Both are nullable, and null means "whatever the registry defaults to for this kind" — so a member who has only ever touched the e-mail boxes still gets the push defaults. |
| `notifications` | Gains `push_sent_at`. |

Nothing here is readable by anybody but the board: an endpoint is not a
device identifier anybody else can resolve, and the two keys are only
useful for encrypting to that one browser.
