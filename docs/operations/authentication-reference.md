# Authentication reference

Members configure credentials at `/usercp/security`. Operators configure board policy under Security settings.

## Two-factor authentication

Meith uses TOTP (SHA-1, six digits, 30-second periods). `security.two_factor_enabled` defaults on; enrolment requires `AUTH_SECRET`, which encrypts stored authenticator secrets.

> [!CAUTION]
> Retain the original `AUTH_SECRET`. Replacing it makes existing authenticator secrets unreadable. Affected factors must be cleared and enrolled again.

`security.two_factor_required_for_staff` defaults off. When enabled, accounts with `admincp.access` must enrol before entering the panel and cannot disable the factor while retaining that access. Turning off new enrolment does not remove the code requirement for enrolled accounts.

Setup confirms one app code, then displays ten one-use 128-bit recovery codes. They are shown once and stored as hashes. Replacing the set invalidates the old codes. Disabling or replacing codes requires a password, or a current factor for passwordless accounts.

### Recovery

A password reset does not bypass two-factor authentication. After verifying identity, an administrator can clear the member's factor with fresh admin authentication, or an operator can run:

```sh
meith user:2fa-clear --user ada
```

This revokes sessions and records recovery in admin and member security logs. Re-enrol afterwards. Use the [deployment invocation](operator-cli.md#the-operator-cli).

### Sign-in gates

Password and federated sign-ins on enrolled accounts create a ten-minute, single-use pending proof rather than a session. The second screen accepts an authenticator code, unused recovery code or enrolled passkey. It rechecks account standing. Wrong codes have separate lockout accounting; already-used TOTP codes are refused.

Passkey sign-in satisfies the complete proof and does not additionally request TOTP. The admin panel independently requires password reauthentication and, when enrolled, a second factor. Its pending proof also expires after ten minutes.

## Sessions

The security page lists live sessions with device, truncated address, creation and last-use times. Revocation applies on the next request. **Sign out everywhere else** retains the current session and refuses if that session cannot be identified.

**Keep me signed in** rotates one-use tokens at `/auth/resume`. Duplicate use within 30 seconds of rotation permits concurrent tabs; later reuse revokes the token family and all account sessions. Already-revoked families remain refused during the grace window.

Resumption and SSO accept top-level navigations, including service-worker forwarding with an empty destination. Background fetches and iframe navigations are refused.

## Security history

Members see their security history at `/usercp/security`; administrators use **Sign-in activity**. Events include successful/refused sign-in, factor/recovery use, credential changes, sign-out and session revocation. Addresses are truncated and user-agent strings shortened. Audit-write failure does not block sign-in.

Set `security.auth_event_retention_days` under Security. Zero retains indefinitely; positive values let hourly `authevents.prune` delete older entries in batches. Deleted history requires a backup to recover.

## Federated sign-in

Enable each provider and set its client ID and secret. Secret fields are write-only; blank submission retains the stored value. Configure the board's public `APP_URL` or saved **Board address** before registering callbacks.

| Provider | Callback | Additional configuration |
|---|---|---|
| GitHub | `/auth/sso/github/callback` | OAuth app; `read:user` and `user:email` |
| Google | `/auth/sso/google/callback` | OAuth 2.0 client; known OIDC issuer |
| OIDC | `/auth/sso/oidc/callback` | Issuer URL, button label and scopes |

OIDC discovery reads `{issuer}/.well-known/openid-configuration`. Scopes default to `openid email profile`; `openid` is always included. Private issuer networking requires the deliberate `OIDC_ALLOW_PRIVATE_HOSTS` override.

Resolution order:

1. Use an already-linked provider identity.
2. Link a provider-verified email to a matching board account.
3. Otherwise provision a new account if registration permits it.

An unverified email cannot claim an existing account; the member must sign in and link manually. GitHub identities use numeric user IDs; a public fallback email is unverified.

Provisioning honours registration closure, address limits, ban filters, activation policy and the default member group. Provider verification can satisfy email confirmation; administrator approval still applies. New accounts have normalised unique usernames and no password until one is set.

### Linking and unlinking

Adding a passkey or identity requires proof of an existing credential, bound to the current session for ten minutes and rechecked before persistence. Password, enrolled passkey, authenticator/recovery code or an already-linked identity can provide proof. Recovery proof consumes its code.

One provider identity can belong to only one account. Removing the last currently usable credential is refused; disabled providers/passkeys do not count as usable. **Let members link and unlink their own sign-ins** can disable self-management without invalidating existing enabled links.

## Passkeys

Enable **Allow passkeys**. Registration and use require browser support and JavaScript. Each member may hold up to 20 labelled passkeys. Removal is immediate and cannot remove the last usable credential.

The board verifies ES256, RS256 or Ed25519 credentials, origin/purpose and signature counters. Banned or inactive accounts remain refused. A passkey can finish a pending second-factor challenge or sign in directly.

## Protocol checks and failures

SSO starts with a same-origin POST and uses a checked hand-off page. State, nonce and PKCE values are fresh per attempt. OIDC checks signature, issuer, audience, expiry and nonce with two minutes of clock-skew tolerance. Redirects stay within accepted destinations. Pending proofs grant no account access.

| Failure | Check |
|---|---|
| Expired attempt | Ten-minute limit and retained cookies |
| Provider unavailable | Enabled state and credentials |
| Identity already claimed | Link belongs to another account |
| Insufficient profile | Email scopes and provider response |
| Wrong TOTP | Correct account and device clock |
| Reused TOTP | Wait for a new code |

Details are logged under `sso` or `passkeys`; provider error bodies are not displayed to members. Disabling a provider preserves its links for re-enabling.
