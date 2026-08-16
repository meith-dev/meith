# Signing in without a password

A Meith board authenticates with a password by default, and nothing else is
switched on until an operator says so. This document covers the two ways to add
to that: **federated sign-in**, where an identity provider vouches for a member,
and **passkeys**, where the member's own device does.

Both are configured in **Admin → Settings → Sign-in providers**. Both are off in
a fresh installation, and a board that leaves them off behaves exactly as it did
before they existed.

## The stance

Turning on a provider means that provider meets your members. Every sign-in
tells GitHub, Google or your own identity server that this board exists, who
signed in, and when. That is a reasonable trade for a company board where
identity is already federated, and a poor one for a small community that would
rather not introduce a third party to its membership list. It is a decision for
the operator, which is why it is a setting rather than a default.

What crosses the wire is small and one-directional: the board asks for a subject
identifier, an e-mail address and a display name, and sends nothing back. It
never receives a password, and never gains access to anything else the member
holds with that provider.

Passkeys involve no third party at all. The credential is created against your
board's own address, the private half never leaves the member's device, and the
board stores a public key it can only use to check a signature.

## Federated sign-in

### What a member sees

The sign-in and registration pages grow a **Continue with …** button for each
provider that is switched on and fully configured. Each button is a form that
posts to this board first, so it works with JavaScript off and cannot be fired
by another site.

Between the button and the provider there is a page that says where the member
is being sent, and follows itself immediately. That hop is not decoration: the
board's [content policy](./operating.md#the-content-policy) carries
`form-action 'self'`, so a browser refuses to let a form submission end up
anywhere but this board — including through a redirect. Handing off from a page
rather than from the form keeps that restriction intact, and leaves a plain link
behind for anyone whose browser does not follow the refresh.

Signing in this way for the first time either finds the member's existing
account or opens a new one. Afterwards it is simply a way in, alongside their
password if they set one.

### Turning one on

Every provider needs three things: a switch, a client ID and a client secret.
The secret is stored like every other secret setting — written once, never shown
again, and left alone if the box is submitted empty.

Each provider also needs a callback URL, which you give to the provider when you
register the board as an application. It is your board address followed by:

| Provider | Callback URL |
|---|---|
| GitHub | `/auth/sso/github/callback` |
| Google | `/auth/sso/google/callback` |
| Any OpenID Connect provider | `/auth/sso/oidc/callback` |

The board builds that URL from **Board address** (or `APP_URL`), falling back to
the host the request arrived on. Set the board address before configuring a
provider: a callback the provider does not recognise is refused, and a callback
built from a host header behind a misconfigured proxy is worse.

#### GitHub

Register an OAuth app in GitHub's developer settings. The board asks for
`read:user` and `user:email`, and reads the primary verified address from the
list GitHub returns. It keys the account on GitHub's numeric user ID, not the
login, so a member who renames themselves on GitHub keeps their account here.

If the member refuses the e-mail scope, the board falls back to whatever public
address the profile carries and treats it as unconfirmed — which is enough to
register a new account under the board's own e-mail confirmation, and not enough
to be handed an existing one.

#### Google

Create an OAuth 2.0 client in the Google Cloud console. Nothing else needs
configuring: Google is reached through the same OpenID Connect path as any other
provider, with its issuer already known.

#### Any other OpenID Connect provider

This is the generic path, and the one an organisation usually wants: Entra ID,
Okta, Keycloak, Authentik, Zitadel, or something you run yourself. Give the
board the **issuer URL** — the one that answers at
`{issuer}/.well-known/openid-configuration` — and it reads every endpoint and
signing key from there. An issuer with a path is fine, which is what Keycloak
realms and Entra tenants look like.

**Scopes** default to `openid email profile`, which is the least an account can
be built from. `openid` is sent whether or not you list it.

**What to call it** fills the gap in "Continue with …". Left empty the button
reads "Single sign-on", which tells a member nothing about which login they are
about to be sent to — set it to the name your organisation uses.

### Meeting an account that already exists

A federated sign-in resolves to an account in one of three ways.

1. **The identity is already linked.** The member is signed in to the account
   holding that link. Nothing about the account changes.
2. **The provider has confirmed an address that matches a member here.** The
   two are linked and the member is signed in. The address must be confirmed by
   the provider: an unconfirmed address is refused with a message telling the
   member to sign in with their password and link the two themselves. Otherwise
   anybody able to set an unverified address at any provider could claim any
   account on the board.
3. **Neither.** A new account is opened, if the board is open to new members.

### What a new account inherits

First-login provisioning goes through the same door as registration, not around
it:

- **Registration closed** refuses the sign-in. A closed board stays closed.
- **The registration IP limit** is spent before the account is created, so a
  federated route cannot be used to outrun the anti-spam settings.
- **Ban filters** are consulted exactly as they are for a typed registration —
  the same check, against the username, the e-mail address and the address the
  request came from. A federated sign-in is not a way past anything a password
  registration meets.
- **Activation method** is honoured. `none` opens an active account. `email`
  accepts the provider's confirmation of the address in place of the board's
  own, and sends its own confirmation link when the provider will not vouch for
  it. `admin` holds the account for approval. `both` records the address as
  confirmed and still waits for an administrator.
- **The default member group** is the same one registration uses, so group
  promotions, permissions and the held-first-post settings all apply unchanged.

The username comes from the provider's username, then its display name, then the
local part of the address. It is folded through the same rules a typed username
meets — allowed characters, length, the reserved list, the locale-independent
uniqueness check — and a number is appended when the obvious name is taken. A
provisioned account has **no password** until the member sets one, and a member
who never sets one cannot use the password form or the reset flow to get in.

### Linking and unlinking

A member manages their own links at **/usercp/security**: every linked provider,
when it was linked, when it was last used, and a button to unlink it. A provider
that is switched on and not yet linked appears as a **Link …** button, which
starts the same handshake in linking mode.

An account may hold several identities — one per provider, and one provider's
identity may only ever belong to one account. Trying to link an identity another
member already holds is refused rather than moved.

Unlinking is refused when it would leave the account with no way in at all: no
password, no passkey and no other link. Set a password first.

Operators who would rather members did not manage this themselves can turn off
**Let members link and unlink their own sign-ins**. Existing links keep working;
the page stops offering to change them.

## Passkeys

Turn on **Allow passkeys** and members can add one from
**/usercp/security** — a fingerprint, a face, or a hardware security key,
depending on the device. Adding and using one needs JavaScript, because the
browser's credential API has no form equivalent; everything else on the page
still works without it.

A member may hold up to twenty passkeys, each with a label of their own choosing
so one device can be told from another later. The list shows when each was added
and last used, and removing one takes effect immediately. As with unlinking, the
last remaining way into an account cannot be removed.

Signing in with a passkey is a button on the sign-in page, shown when the
browser supports them. The board accepts ES256, RS256 and Ed25519 credentials,
checks the signature against the stored public key, and refuses a signature
counter it has already seen — the standard clone check.

A passkey does not replace the member's password unless they clear it
themselves, and it does not bypass anything: a banned or unactivated account is
refused a passkey sign-in exactly as it is refused a password one.

## What the board does to keep the handshake honest

- Every federated sign-in starts with a `POST` from a page on this board, and
  the route refuses a request that did not come from here. A sign-in cannot be
  started by a link on another site, which is what would otherwise let somebody
  drop a victim into an account that is not theirs.
- The hand-off page is reached only with a live handshake cookie, and the
  address it forwards to is the one the board built a moment earlier — never
  anything a query string carried in.
- The state, the nonce and the PKCE verifier are drawn fresh per attempt and
  held in a short-lived, HTTP-only cookie. The callback refuses anything whose
  state does not match, and the cookie is cleared before the response is read
  either way.
- The identity token is verified against the provider's published signing keys:
  signature, issuer, audience, expiry and nonce, with a two-minute allowance for
  clock skew. An unsigned token, or one signed with an algorithm the board does
  not accept, is refused.
- The post-sign-in destination is checked with the same helper every other
  redirect on the board uses, so a crafted `next` cannot bounce a member
  off-site.
- The passkey challenge is held in a strict, HTTP-only cookie and is bound to
  the request it was issued for — a challenge issued for enrolment cannot be
  answered with a sign-in.

## When something goes wrong

Failures land the member back on the page they started from with a plain
explanation, and the detail goes to the log under the `sso` or `passkeys`
module. The board never puts a provider's own words on its pages.

| What the member sees | Usually means |
|---|---|
| That sign-in attempt had expired | More than ten minutes passed, or cookies were dropped between the two requests |
| The sign-in was cancelled | The member said no at the provider |
| That way of signing in is not switched on | The provider was turned off, or its credentials were cleared, mid-handshake |
| An account here already claims that identity | The provider account is linked to a different member |
| The provider did not send enough to open an account with | No address came back — check the scopes |

A provider that has been switched off stops appearing and stops accepting
callbacks. The links themselves are kept, so turning it back on restores every
member's access without them doing anything.
