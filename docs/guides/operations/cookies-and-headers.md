# Cookies and security headers

What the board puts in a visitor's browser, and what it tells the
browser to refuse. This is the page to read when somebody asks what you
store about them, when a cookie banner is being drafted, or when
something on the board is being blocked and you need to know by what.

None of it is configurable from the admin panel. It is part of the
software, and the one thing that changes it is an environment variable,
named below.

## The cookies

**The board sets no third-party cookies, runs no analytics, and stores
nothing for advertising.** Every cookie below is first-party, set by the
board itself, and there to make a specific thing work.

| Cookie | What it is for | Lifetime |
| --- | --- | --- |
| `fs_session` | The signed-in session | Until it expires or you sign out |
| `fs_remember` | *Remember me* on the sign-in form | The remember period |
| `fs_guest` | Counts one reader once, for "who's online" | 1 day |
| `fs_admin` | Admin-panel re-authentication | The admin session |
| `fs_2fa` | A sign-in that has given a password and owes a second factor | Short |
| `fs_sso` | The single sign-on handshake | 10 minutes |
| `fs_passkey` | The passkey exchange | Short |

Every one is **`HttpOnly`** — script cannot read any of them — and every
one is **`Secure`** wherever the board is served over HTTPS. Over HTTPS
they also carry the **`__Host-` prefix** (`__Host-fs_session` and so on),
which binds a cookie to the exact origin that set it and forbids a
subdomain from writing it.

`SameSite` differs by purpose, and the differences are deliberate:

- **`Lax`** for the session, remember, guest and SSO cookies. The SSO
  one has to be `Lax`: an identity provider returns the member with a
  top-level navigation from another site, and a `Strict` cookie is not
  sent on that request, so every federated sign-in would fail.
- **`Strict`** for the admin, second-factor and passkey cookies. Nothing
  in those exchanges ever starts on another site, so nothing is lost by
  refusing to send them cross-site.

The admin cookie is also **scoped to `/admin`**, so it is not sent with
ordinary board requests at all.

### The guest cookie, and what it is not

`fs_guest` is the only cookie a visitor gets without signing in, and it
exists for one figure: "37 guests reading". That number is not derivable
from a stateless request — without something that comes back, every page
view is a stranger.

It is **an opaque random value and nothing else**. No code path turns it
into an identity, and the session lookup refuses a row with no user
behind it. The most it can say about the person holding it is that they
were here. It lasts a day.

Whether that needs consent where you operate is a question for you, not
for this page — but "strictly necessary" is an argument you can actually
make about it, which is not true of an analytics cookie.

## The Content Security Policy

Every page is served under a **nonce-based policy**, generated fresh per
request:

```
default-src 'self';
img-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self' 'nonce-<per-request>' 'strict-dynamic';
connect-src 'self'; worker-src 'self'; manifest-src 'self';
frame-ancestors 'self'; object-src 'none';
base-uri 'self'; form-action 'self'
```

What that means in practice:

- **An injected `<script>` does not run.** It has no nonce, and
  `'strict-dynamic'` means the browser trusts scripts the board's own
  nonced scripts load, and nothing else.
- **Nothing loads from another origin** — no CDN, no font host, no
  embedded widget. A theme or plugin that reaches for one will be
  blocked, and the browser console will say so.
- **`form-action 'self'`** means a form on your board cannot be made to
  post somewhere else.
- **`frame-ancestors 'self'`** means the board cannot be framed by
  another site.

**One environment variable changes it.** `REMOTE_IMAGES=1` adds `https:`
to `img-src`, which is what lets members hotlink images from elsewhere.
It is off by default: allowing remote images means every post can make a
reader's browser fetch from a third party, which leaks the reader's IP
address to whoever hosts it.

The e2e suite asserts that every page carries the policy **and that
nothing on the page is refused under it**, so a change that would have
needed `unsafe-inline` fails before it ships.

## The other headers

Sent on every response:

| Header | Value | What it stops |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | A browser guessing a type and running an upload as script |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | A full path leaking to another site |
| `Strict-Transport-Security` | `max-age=63072000` | A downgrade to HTTP for two years |
| `X-Frame-Options` | `SAMEORIGIN` | Framing, for browsers older than `frame-ancestors` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Anything asking for hardware the board never uses |

If you terminate TLS at a reverse proxy, it has to pass these through
rather than replace them — see
[Docker Compose](../../getting-started/deployment/docker-compose.md) for
the CSP note on proxying.
