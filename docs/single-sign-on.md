# Signing in

A Meith board authenticates with a password by default. This document covers
everything that can be added to or put in front of that:

- **A second factor** — a code from an authenticator app, asked for after the
  password.
- **Federated sign-in** — an identity provider (GitHub, Google, or your own
  OpenID Connect server) vouches for a member.
- **Passkeys** — the member's own device does.

It also covers the two surfaces that come with them: the list of devices
holding a session, and the record of what has happened to an account's
sign-in.

**Where it is configured.** The second factor lives under
**Admin → Settings → Security**; federated sign-in and passkeys under
**Admin → Settings → Sign-in providers**. In a fresh installation federated
sign-in and passkeys are off, and the second factor is offered but never
forced — no member is asked for a code until they set one up.

## Before you turn on a provider

A second factor and a passkey involve nobody but the member and your board. A
federated provider is different: turning one on means that provider meets
your members. Every sign-in tells GitHub, Google or your identity server
that this board exists, who signed in, and when. That is a reasonable trade
for a company board where identity is already federated, and a poor one for
a small community that would rather not introduce a third party to its
membership list. It is the operator's decision, which is why it is a setting
rather than a default.

What crosses the wire is small and one-directional: the board asks for a
subject identifier, an e-mail address and a display name, and sends nothing
back. It never receives a password and never gains access to anything else
the member holds with the provider.

Passkeys involve no third party at all. The credential is created against
your board's own address, the private half never leaves the member's device,
and the board stores only a public key it can use to check a signature.

## A second factor

### What it is

An authenticator app holds a secret shared with the board and turns it into
a six-digit code that changes every thirty seconds. Asked for after the
password, it means a leaked password is not on its own enough to open an
account.

The board implements the ordinary standard (RFC 6238: SHA-1, six digits, a
thirty-second period), so any authenticator app works — Aegis, Ente Auth,
1Password, Google Authenticator, whatever your members already have.

### Board settings

**Offer two-factor authentication** (`security.two_factor_enabled`) decides
whether the surface exists at all. It is on by default, which costs a board
nothing: nobody is asked for a code until they have set one up.

It needs `AUTH_SECRET` set. The secret an authenticator app holds is a
password equivalent — with it, anybody can mint that member's codes forever
— so the board encrypts it with a key derived from `AUTH_SECRET` before
storing it. With no key there is nowhere safe to put the secret, and the
whole surface hides itself rather than pretending.

> [!WARNING]
> Changing `AUTH_SECRET` on a board where members have set up a second
> factor strands every stored secret. They cannot be decrypted again, and
> every affected member has to set up their app from scratch. The board
> says so plainly rather than reporting a wrong code. Clearing a stranded
> factor — from the panel or the CLI, [below](#when-the-app-and-the-codes-are-both-gone)
> — needs no key, so a rotated secret does not lock those members out
> permanently.

**Require it of anyone who can reach the control panel**
(`security.two_factor_required_for_staff`) is off by default. Turned on, an
account with `admincp.access` is refused the panel until it has an
authenticator app set up, and cannot turn its second factor off while it
holds that access. The panel can rewrite the whole board; a password alone
is a thin thing to protect that with.

Turning **Offer two-factor authentication** back off does not release the
members who already set one up: the sign-in gate asks for a code because the
account holds a factor, not because the board offers the feature, so
switching it off would otherwise lock those members in rather than out. They
keep their panel on **/usercp/security** — enough of it to replace their
recovery codes or turn the factor off — while nobody new is offered the
setup.

### What a member does

From **/usercp/security**, a member presses *Set up an authenticator app*.
The board shows a key to type into the app, and an `otpauth://` link that
opens the app directly on a phone. They type back the code the app shows —
which proves the two agree — and the board hands over **ten recovery
codes**.

The recovery codes are shown once and stored only as hashes. Each one signs
in exactly once, in place of a code, for the day a phone is lost. A member
can replace the set at any time (which retires the old set), and the page
shows how many are left.

The confirmation posts back to `/usercp/security?factor=setup`, and that
response is the only place the fresh codes exist. The page therefore stays on
the setup screen for as long as `?factor=setup` is in the address rather than
swapping straight to the settled panel — otherwise a member browsing without
JavaScript never sees the codes at all.

A board can refuse the whole operation — the feature switched off between the
page rendering and the button being pressed, or a shared demo login whose
sign-in method is fixed. A refusal is reported on the page like any other
form error; it never fails the request.

Turning the second factor off — or replacing the recovery codes — asks for
the password again. An account with no password (one that arrived through a
provider, or holds only passkeys) gives a current code instead, which proves
the same possession.

### When the app and the codes are both gone

A member who still has one recovery code has not lost anything: it signs
them in, and they can replace the set from **/usercp/security** afterwards.
A member who has lost the app *and* every code cannot get in on their own,
and a password reset does not help — the reset changes the password, and the
second screen still asks for a code.

That is what an operator is for. **Admin → Members → the member → Second
factor** clears it, and the panel asks for the administrator's own password
and code first. Clearing signs every one of that member's sessions out and
leaves the account on its password alone until they set an app up again; the
board records it in the admin log and in the member's own security activity,
where it reads as cleared by staff rather than by them. Nothing about it
proves who asked — satisfy yourself that you are talking to the member
before you press it.

The panel cannot help the one case that matters most: the sole
administrator of a board that requires a second factor of its staff, who has
lost theirs. That is what the operator CLI is for, and it needs no panel
session:

```sh
community user:2fa-clear --user ada
```

It does the same work — clears the factor, ends every session, writes the
same entry — from a shell on the host. See
[the operator CLI](./operating.md#the-operator-cli) for how to reach it on
your deployment.

### What signing in looks like

The password step is unchanged. When it succeeds and the account has a
second factor, the board does not start a session: it holds the
half-finished sign-in for ten minutes and asks for the code on a second
screen. Only when that is satisfied does a session begin.

The hold is a random token in a strict, HTTP-only cookie, backed by a row
that is spent exactly once. It is not a session and grants nothing: an
account banned between the two steps is refused at the second, and giving
the password again drops any earlier hold.

The second screen accepts a code from the app, one of the recovery codes, or
— if the member has a passkey — the passkey, which proves possession just as
well. Wrong codes count against the same lockout thresholds the password
uses, on their own counter. A code that has already been used is refused
even within the thirty seconds it would otherwise be valid — anybody who
reads a code over a shoulder has that window to race the member, and this
closes it.

### The control panel's own door

The admin panel has always asked for the password again on the way in. With
a second factor set up, it asks for the code too, in the same form —
re-proving only the half most likely to have leaked would be re-proving the
wrong one.

## Where a member is signed in

**/usercp/security** lists every live session on the account: the device it
was started from, the truncated address, when it started, when it was last
seen, and which one is the browser reading the page. Any of the others can
be signed out one at a time, or all at once.

Revocation is immediate — the session row is marked, and the next request it
makes is refused. Device and address are recorded when a session starts, so
sessions that predate this feature list as an unknown device until they are
replaced.

A member whose session was ended from another device still holds a cookie, so
they reach the control panel as a guest rather than being stopped at the door.
The panel answers that by sending them to the sign-in page with their
destination attached, not with a 404 — the page has not gone, they have been
signed out of it.

"Sign out everywhere else" keeps the session reading the page and ends the
rest. If the board cannot work out which session that is it refuses the whole
operation rather than guessing, because the guess that ends everything would
sign the member out of the page they are standing on.

### Keeping a member signed in

"Keep me signed in" issues a remember token alongside the session. Opening the
board once the session has lapsed spends that token at **/auth/resume** and
issues a fresh one — single use, so a token that turns up twice is evidence
that a copy of it exists somewhere it should not, and the whole family plus
every session on the account is ended.

Two requests carrying the same token are not always theft, though. A browser
restoring several tabs, a double-clicked link and a prefetch racing its own
navigation all present the identical cookie within the same moment, and
exactly one of them can win a single-use claim. Tokens are therefore honoured
for **30 seconds** after their own rotation: inside that window the losers are
issued their own fresh tokens and nobody is signed out, and outside it a
replay is treated as theft as before. A family that has already been burned is
refused inside the window as well — the board has made its decision about it.

Because the requests race, the losing one can carry a timestamp from just
before the winner marked the token spent. The window is measured in both
directions for that reason; requiring the elapsed time to be positive would
refuse the exact case the window exists to forgive.

## What has happened to an account

The board keeps a durable record of authentication events: password
sign-ins and refused attempts, sign-outs, wrong second-factor codes,
recovery codes used, password and e-mail changes, sessions revoked, a second
factor cleared by staff, and every provider or passkey added or removed.

A member sees their own record, newest first, at the bottom of
**/usercp/security**. An operator sees the board's, filterable by kind, at
**Admin → Sign-in activity**. It is deliberately separate from the admin
log: that one records what was done by somebody already inside, this one
records how they got in.

Each entry keeps the truncated address and a shortened user-agent string,
which is what makes "that was not me" answerable. Writing an event never
blocks the thing it records: a sign-in that works but goes unrecorded is a
gap in an audit trail, while a sign-in refused because the trail was
unwritable would be an outage.

A refused sign-in is filed against the account whose name or address was
typed, when there is one, so the member reading their own page sees the
attempts made on their account rather than only their own mistakes. What the
board *answers* the person at the keyboard does not change: the response to
a wrong password is the same whether or not the name exists, and the log is
not a surface anybody outside can read.

Two kinds of entry come from the panel rather than from the member: an
address changed by staff, and a second factor cleared by staff. Both are
filed against the member so they appear on their own page, and both are
recorded without an address or a device — that would be the administrator's,
not theirs. Who did it, and from where, is in the admin log.

### How long it is kept

**Days of sign-in activity to keep** (`security.auth_event_retention_days`,
under **Admin → Settings → Security**) is **0** by default, which keeps every
entry forever: an audit trail that deletes itself without being asked is one
you cannot rely on. Set it to a number of days where a retention policy says
you must, and the hourly `authevents.prune` task drops anything older, in
batches, from then on. Lowering it deletes history that cannot be recovered
without a restore.

## Federated sign-in

### What a member sees

The sign-in and registration pages grow a **Continue with …** button for
each provider that is switched on and fully configured. Each button is a
form that posts to this board first, so it works with JavaScript off and
cannot be triggered by another site.

Between the button and the provider there is a page that says where the
member is being sent, then follows itself immediately. That hop is not
decoration: the board's [content policy](./operating.md#the-content-security-policy)
carries `form-action 'self'`, so a browser refuses to let a form submission
end anywhere but this board — including through a redirect. Handing off from
a page keeps that restriction intact, and leaves a plain link behind for any
browser that does not follow the refresh.

Signing in this way for the first time either finds the member's existing
account or opens a new one. After that it is simply another way in,
alongside their password if they have one.

### Turning a provider on

Every provider needs three things: a switch, a client ID and a client
secret. The secret is stored like every other secret setting — written
once, never shown again, and left alone when the box is submitted empty.

Each provider also needs a **callback URL**, which you give to the provider
when you register the board as an application. It is your board's address
followed by:

| Provider | Callback URL |
|---|---|
| GitHub | `/auth/sso/github/callback` |
| Google | `/auth/sso/google/callback` |
| Any OpenID Connect provider | `/auth/sso/oidc/callback` |

The board builds that URL from `APP_URL` if set, otherwise from **Board
address** in the settings, falling back to the host the request arrived on.
Set the board's address before configuring a provider: a callback the
provider does not recognise is refused, and a callback built from a host
header behind a misconfigured proxy is worse.

#### GitHub

Register an OAuth app in GitHub's developer settings. The board asks for
`read:user` and `user:email`, and reads the primary verified address from
the list GitHub returns. It keys the account on GitHub's numeric user ID,
not the login, so a member who renames themselves on GitHub keeps their
account here.

If the member refuses the e-mail scope, the board falls back to whatever
public address the profile carries and treats it as unconfirmed — enough to
register a new account under the board's own e-mail confirmation, and not
enough to be handed an existing one.

#### Google

Create an OAuth 2.0 client in the Google Cloud console. Nothing else needs
configuring: Google is reached through the same OpenID Connect path as any
other provider, with its issuer already known.

#### Any other OpenID Connect provider

This is the generic path, and usually the one an organisation wants: Entra
ID, Okta, Keycloak, Authentik, Zitadel, or something you run yourself. Give
the board the **issuer URL** — the one that answers at
`{issuer}/.well-known/openid-configuration` — and it reads every endpoint
and signing key from there. An issuer with a path works, which is what
Keycloak realms and Entra tenants look like.

**Scopes** default to `openid email profile`, the least an account can be
built from; `openid` is always sent whether or not you list it.

**What to call it** fills the gap in "Continue with …". Left empty, the
button reads "Single sign-on", which tells a member nothing about which
login they are about to be sent to — set it to the name your organisation
uses.

### Meeting an account that already exists

A federated sign-in resolves to an account in one of three ways:

1. **The identity is already linked.** The member is signed in to the
   account holding that link. Nothing about the account changes.
2. **The provider has confirmed an address that matches a member here.**
   The two are linked and the member is signed in. The address must be
   confirmed *by the provider*: an unconfirmed address is refused, with a
   message telling the member to sign in with their password and link the
   two themselves. Otherwise anybody able to set an unverified address at
   any provider could claim any account on the board.
3. **Neither.** A new account is opened — if the board is open to new
   members.

### What a new account inherits

First-login provisioning goes through the same door as registration, not
around it:

- **Registration closed** refuses the sign-in. A closed board stays closed.
- **The registration IP limit** is spent before the account is created, so
  a federated route cannot outrun the anti-spam settings.
- **Ban filters** are consulted exactly as for a typed registration — the
  same check, against the username, the e-mail address and the address the
  request came from.
- **The activation method is honoured.** `none` opens an active account.
  `email` accepts the provider's confirmation of the address in place of
  the board's own, and sends the board's own confirmation link when the
  provider will not vouch for it. `admin` holds the account for approval.
  `both` records the address as confirmed and still waits for an
  administrator.
- **The default member group** is the same one registration uses, so group
  promotions, permissions and held-first-post settings all apply
  unchanged.

The username comes from the provider's username, then its display name,
then the local part of the address — folded through the same rules a typed
username meets (allowed characters, length, the reserved list, the
case-insensitive uniqueness check), with a number appended when the obvious
name is taken. A provisioned account has **no password**: the password form
refuses it until the member sets one, from the UserCP or through the
password-reset flow to their confirmed address.

### Linking and unlinking

A member manages their own links at **/usercp/security**: every linked
provider, when it was linked, when it was last used, and a button to unlink
it. A provider that is switched on and not yet linked appears as a
**Link …** button, which starts the same handshake in linking mode.

One provider identity only ever belongs to one account: trying to link an
identity another member already holds is refused rather than moved.

Unlinking is refused when it would leave the account with no way in at all
— no password, no passkey and no other link. Set a password first. Only
credentials the board would accept *today* count: a passkey on a board that
has switched passkeys off, or a link to a provider the operator has turned
off, opens nothing and is not treated as a way back in.

Operators who would rather members did not manage this themselves can turn
off **Let members link and unlink their own sign-ins**. Existing links keep
working; the page stops offering to change them.

## Passkeys

Turn on **Allow passkeys** and members can add one from
**/usercp/security** — a fingerprint, a face, or a hardware security key,
depending on the device. Adding and using one needs JavaScript, because the
browser's credential API has no form equivalent; everything else on the
page still works without it.

A member may hold up to twenty passkeys, each with a label of their own
choosing so one device can be told from another later. The list shows when
each was added and last used, and removing one takes effect immediately. As
with unlinking, the last remaining way into an account cannot be removed.

Signing in with a passkey is a button on the sign-in page, shown when the
browser supports them. The board accepts ES256, RS256 and Ed25519
credentials, checks the signature against the stored public key, and
refuses a signature counter it has already seen — the standard clone
check.

A passkey does not replace the member's password unless they clear it
themselves, and it does not bypass anything: a banned or unactivated
account is refused a passkey sign-in exactly as it is refused a password
one.

## How the handshake is kept honest

- Every federated sign-in starts with a `POST` from a page on this board,
  and the route refuses a request that did not come from here. A sign-in
  cannot be started by a link on another site — which is what would
  otherwise let somebody drop a victim into an account that is not theirs.
- The hand-off page is reached only with a live handshake cookie, and the
  address it forwards to is the one the board built a moment earlier —
  never anything a query string carried in.
- The state — and on the OpenID Connect path, the nonce and the PKCE
  verifier — is drawn fresh per attempt and held in a short-lived,
  HTTP-only cookie. The callback refuses anything whose state does not
  match, and the cookie is cleared before the response is read either way.
- On the OpenID Connect path, the identity token is verified against the
  provider's published signing keys: signature, issuer, audience, expiry
  and nonce, with a two-minute allowance for clock skew. An unsigned
  token, or one signed with an algorithm the board does not accept, is
  refused.
- The post-sign-in destination is checked with the same helper every other
  redirect on the board uses, so a crafted `next` parameter cannot bounce a
  member off-site.
- The passkey challenge is held in a strict, HTTP-only cookie and is bound
  to the purpose it was issued for — a challenge issued for enrolment
  cannot be answered with a sign-in, and one issued to finish a second
  factor is scoped to that member's own credentials.
- A half-finished sign-in is a token that grants nothing on its own: it
  names the account waiting on its second factor, is spent exactly once,
  and the account's standing is checked again before the session begins.

## When something goes wrong

Failures land the member back on the page they started from with a plain
explanation, and the detail goes to the board's log under the `sso` or
`passkeys` module. The board never puts a provider's own words on its
pages.

| What the member sees | Usually means |
|---|---|
| That sign-in attempt had expired | More than ten minutes passed, or cookies were dropped between the two requests |
| The sign-in was cancelled | The member said no at the provider |
| That way of signing in is not switched on | The provider was turned off, or its credentials cleared, mid-handshake |
| An account here already claims that identity | The provider account is linked to a different member |
| The provider did not send enough to open an account with | No address came back — check the scopes |
| That code is not right | The app's clock has drifted more than thirty seconds, or the code belongs to another account in the app |
| That code has been used already | The same code was submitted twice — wait for the next one |

A provider that has been switched off stops appearing and stops accepting
callbacks. The links themselves are kept, so turning it back on restores
every member's access without them doing anything.
