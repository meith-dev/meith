# Cookies and browser security

## Authentication cookies

All cookies below are first-party and `HttpOnly`, with `Secure` on HTTPS. Root-path cookies use `__Host-` names on HTTPS and unprefixed names in HTTP development. Admin cookies keep their unprefixed names because they are scoped to `/admin`.

| Base name | Purpose | SameSite | Lifetime |
|---|---|---|---|
| `fs_session` | Board session | Lax | Session expiry/sign-out |
| `fs_remember` | Persistent sign-in | Lax | Remember period |
| `fs_guest` | Anonymous presence | Lax | 1 day |
| `fs_admin` | Panel session; `/admin` path | Strict | Panel session |
| `fs_admin_2fa` | Pending panel proof; `/admin` path | Strict | 10 minutes |
| `fs_2fa` | Pending board proof | Strict | 10 minutes |
| `fs_sso` | Provider handshake | Lax | 10 minutes |
| `fs_passkey` | Passkey handshake | Strict | 10 minutes |

`fs_guest` contains an opaque presence identifier, not an authenticated identity. These are authentication/presence cookies, not an exhaustive list of appearance, timezone or dismissal preferences. The stock board does not add advertising or analytics cookies.

## Content Security Policy

Production pages use a fresh request nonce:

```text
default-src 'self';
img-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self' 'nonce-<per-request>' 'strict-dynamic';
connect-src 'self'; worker-src 'self'; manifest-src 'self';
frame-ancestors 'self'; object-src 'none';
base-uri 'self'; form-action 'self'
```

`REMOTE_IMAGES=1` adds `https:` to image sources. Remote hosts then receive readers' image requests and IP addresses. External scripts, widgets and off-origin form redirect chains remain restricted.

## Other headers

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

Preserve these through the reverse proxy. See [Compose deployment](docker-compose.md).

## Trusted proxies

`TRUSTED_PROXY_HOPS` defaults to 0. Set the actual trusted proxy count when the deployment supplies forwarded addresses. Meith counts from the right of `X-Forwarded-For`; incorrect trust changes rate-limit, allowlist and audit identities. Do not expose a direct route around the trusted proxy.
