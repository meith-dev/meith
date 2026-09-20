# Web push

## Configure

Serve over HTTPS (localhost is allowed for development). Generate keys once:

```sh
docker compose run --rm web meith push:keys --save
```

Without `--save`, the command prints a pair for manual entry. At `/admin/settings?group=push`, enable **Offer web push** and verify the VAPID keys and contact address.

The contact must be `mailto:` or `https:`. If unset, Meith tries the mail sender, then the board HTTPS address. Without a usable contact or key pair, push remains unavailable.

> [!WARNING]
> Replacing VAPID keys invalidates existing browser subscriptions. Members must resubscribe; the preferences page attempts this on their next visit.

## Subscribe

Members open `/notifications/preferences`, subscribe each browser and choose notification kinds independently of email. Browser registration requires JavaScript; the other preference forms do not. Up to 20 subscriptions are allowed per member.

On iPhone/iPad, install the board on the home screen before subscribing. See [WebKit's web-push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Push passes through the browser vendor's service. Payloads are encrypted under [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291); the service still observes endpoint and delivery timing.

## Delivery

Scheduled outbox work creates separate email and push jobs. Coalesced events do not send again. Failed sends retry; HTTP 404/410 removes expired subscriptions. Payloads contain localized text, notification ID, same-origin target and unread count.

Production outbound restrictions apply; `PUSH_ALLOW_PRIVATE_HOSTS` is only for an intended private endpoint. Check [Scheduled tasks](scheduled-tasks.md).

## Service worker

`public/sw.js` displays pushes and opens/focuses their same-origin target, falling back to `/notifications`. It intercepts only top-level document navigation, tries the network first and serves precached `/offline` after a network failure. It does not cache member pages, APIs or assets.

The offline page is static English. A failed install-time precache leaves the browser's normal offline error until a subsequent worker installation. `/manifest.webmanifest` uses board settings and is available independently of push.

## Troubleshoot

| Symptom | Check |
|---|---|
| No subscribe button | Push setting, keys and contact |
| Browser refuses | Site permission; home-screen installation on iOS |
| Subscribed but no delivery | Member kind preferences, outbox and tick |
| One device stops | Expired endpoint; resubscribe |
| All devices stop | VAPID key change or shared delivery failure |

Subscription records are removed with the account or expired endpoint and transferred during account merge.
