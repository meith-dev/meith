# Ban filters

A ban filter turns somebody away **before an account exists**. It is not
a ban: there is no member to ban yet. A person a filter matches never
registers, never appears in the member list, and never reaches the
approval queue.

`/admin/users/ban-filters` holds them. It is an administrator's screen —
a moderator's route to keeping somebody out is the warning ladder, a
ban, or asking an administrator. See
[the moderator's guide](./moderation-guide.md#bans-and-what-you-can-reach).

## What a filter is

Three fields:

- **Matches on** — one of three things a would-be member offers.
- **The pattern** — what that thing is compared against.
- **A note** — optional, seen only on this screen. Why the filter
  exists, so whoever reads it in six months knows whether it still
  needs to.

The screen also records who added each filter and when, and both adding
and removing one are written to the admin log.

### The three kinds

| Matches on | Compared against |
| --- | --- |
| **Username** | The name being registered, or the name of the account signing in |
| **E-mail address** | The address being registered, or the address on the account signing in |
| **Address the request came from** | The IP address the request arrived from |

A username or e-mail filter is compared **ignoring case**, so
`Spammer` and `spammer` are the same pattern.

## Patterns are globs, not regular expressions

This is the one thing worth reading twice.

- `*` matches any run of characters, including none.
- `?` matches exactly one character.
- **Every other character matches itself**, a full stop included.

So `.*` does not mean "everything". It matches the two characters `.`
and `*`, and almost nothing else. The pattern for every address at a
domain is `*@example.com`; the pattern for a range of addresses is
`198.51.100.*`.

> [!WARNING]
> A pattern of nothing but `*` would match everybody and is refused. If
> you want to stop all new members, close registration in the
> settings rather than filtering everyone out.

Two limits keep a pattern from being expensive or absolute: at most 200
characters, and at most 20 wildcards. A pattern past either is refused
when you save it.

**A filter that would match you is refused too.** Saving a pattern that
matches your own username, your own address, or the network you are
reading the screen from would lock you out of the board with no way
back through the interface, so the screen will not let you.

## Where a filter is consulted

Every route into an account:

- A typed registration — the username, the address and the request's
  address are all checked.
- A sign-in — the request's address is checked before any password is
  verified, and the account's username and address once it is.
- A registration through a single sign-on provider, against the address
  the provider returned and the username it asked for.

Somebody a filter turns away is told the board cannot accept that
account and to contact an administrator. **The message never says which
of the three matched**, deliberately: naming the field would tell
somebody trying to get in exactly what to change.

Two places deliberately do not consult filters, because both are the
board's own way back in:

- **The installer**, which creates the first administrator.
- **`meith user create`** on the command line.

## What a filter does not do

- It does not touch an account that already exists. Somebody who
  registered before you added the filter keeps their account — but the
  filter is checked at sign-in too, so they cannot get back in. To
  remove them properly, ban the member.
- It does not tell you it matched. A refused registration leaves no
  member and no report; the admin log records the filter being added,
  not each person it turned away.
- It does not expire. A filter stays until somebody removes it, which
  is why the note field is worth filling in.
