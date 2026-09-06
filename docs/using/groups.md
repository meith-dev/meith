# Groups and promotions

A group is a set of permissions and the members who hold it. Everything
a member may do that is not decided per forum is decided by their groups,
and so is the badge beside their name.

`/admin/groups` lists them. The per-forum half of the model, the matrix
and what overrides a group's defaults in one forum, is
[Forums and permissions](./forums.md#permissions).

## What a group holds

Every member has exactly one **primary group** and any number of
**additional** ones. Additional groups only ever add: a member's answers
are the combination of every group they hold, and a tick can only grant.

Seven groups ship with a board and cannot be deleted, because the board
resolves them by key: Guests, Registered, Administrators, Super
moderators, Moderators, Awaiting activation, and Banned. Their
permissions are still yours to change.

**Creating one** asks for a key (lower-case letters, numbers and
underscores, fixed once set), a title, and **a group to copy permissions
from**, which is required. The bare defaults deny everything, leaving a
group whose members cannot see the board. Copy Registered unless you
mean otherwise.

### A group's permissions

`/admin/groups/[id]` holds two kinds of field, and the screen says which
is which:

- **Board-wide answers**: private messages, signatures, avatars,
  reporting, the moderator control panel, the admin panel, warnings,
  reputation, and the numeric allowances below.
- **A default for every forum**: the value used in any forum whose
  matrix leaves this group's cell on *inherit*.

They combine across a member's groups the same way they do in a forum:
switches are OR, numbers take the most generous value, and the three
*requires approval* fields, shown here as **ticked = restricted**, are
AND, so any group that lifts a restriction lifts it everywhere.

### Numbers behave differently from switches

Numeric permissions (attachments per post, signature length, the edit
window, the daily allowances) combine as the **most generous** value
across a member's groups.

> [!NOTE]
> **`0` means unlimited, not none.** A member in *any* group set to `0`
> is unlimited regardless of what their other groups say. That is also
> how you exempt somebody: put them in a group that sets it to `0`.

### The daily post allowance

`maxPostsPerDay` is a board-wide numeric permission that caps **threads
and replies together**. It is spent on the same database counters the
anti-spam limits use, so every instance of your board shares one
allowance.

- **`0` is unlimited.**
- **The day is a UTC day**: a fixed window aligned to midnight UTC, not
  a per-member calendar.
- **Guests are not counted.** The cap is per member id.
- **Bypass flood check does not lift it.** That permission covers the
  flood interval and the hourly anti-spam limits, which are board
  settings; this one is a value the group itself carries.

Somebody who has spent their allowance is told so, and told roughly when
it comes back, in hours.

### The daily private message allowance

`maxPrivateMessagesPerDay` works the same way for **sending** private
messages, on its own counter: a member who has run out of posts can still
send messages, and the other way round. One send is one unit however many
people it addresses.

> [!IMPORTANT]
> **`maxPrivateMessagesPerDay` and `privateMessageQuota` are different
> controls.** The first is a *rate*: how many a member may send in a
> day. The second is *storage*: how many they may keep, which is what a
> full inbox means. Setting one does nothing about the other.

## How a group looks

`/admin/groups/[id]` carries a group's appearance as well as its rights.
All of it is optional:

- **A name colour**, set separately for **light and dark**. Fill in both;
  the board will not guess the second one. An unfilled picker leaves
  readers of that scheme the ordinary text colour. The value is checked
  before it is stored, because it goes into a stylesheet.
- **A badge**, as two uploads, light and dark. Upload only the light one
  and it is used in both.
- **The title**: what shows under a member's name on every post, one
  line per displayed group.
- **Display order**, and a **staff group** flag, which puts the group on
  the board's staff page at `/staff`. Groups appear there in display
  order, each listing everyone who holds it.

The colour reaches every username: the postbit, who started a thread, who
posted last, the profile heading, who is online.

### Display groups

A member is shown as their **display group** where they have chosen one,
and their primary group otherwise. Members choose it under **UserCP →
Profile**, from the groups they hold; picking their primary group stores
nothing, so the choice keeps following that group. The picker is not
shown to a member who holds only one group.

**Maximum displayed groups**, under the board's display settings, says
how many of a member's groups appear with their name in the postbit and
on the profile heading: the display group first, then the rest in
display order, cut off at the cap. Each title renders in its own group's
colour. Set it to `1` to show the display group alone; it ships at `3`.
The badge and the name colour are always the display group's.

**Staff are shown as staff, and have no choice about it.** A member whose
primary group is a staff group, or any group carrying administrative or
moderation power, leads as that group everywhere: first group shown,
badge and colour. They get no picker, and are refused if they submit the
form anyway. This is a display rule, not a membership one: staff can
hold any other group, including one they paid for, and get everything it
carries.

A stored display choice survives an administrator moving the member
between groups, except where it has stopped meaning anything: a member
displaying the group they are being moved out of, or into, has the row
cleared.

## Groups a plugin may grant

The same screen carries one more switch: **may be granted by plugins**.
It is off by default, and it is the opt-in behind any plugin that hands
out membership: a paid pass, a trial, time-boxed access. A plugin can
only put a member in a group you have marked this way, and only **until a
date**: every plugin-granted membership expires, capped at two years, and
the expiry holds even if the plugin is removed or the tick stops. Every
grant also carries a reason, which is the row's audit trail.

A plugin may ask for the group it grants to become the member's
**primary** one. The group they were primary in becomes a secondary
membership, and comes back when the grant lapses or is revoked. **A staff
member's primary group is never displaced**: buy a membership as a
moderator and you get the group as a secondary membership, but you stay
a moderator and are still shown as one.

The switch refuses staff groups, system groups, and any group whose
permissions carry administrative or moderation power, meaning any of
these eight:

`isAdministrator`, `canAccessAdminCp`, `isSuperModerator`,
`canAccessModCp`, `canWarnUsers`, `canApproveContent`,
`canEditOthersPosts`, `canSoftDeletePosts`.

The same test runs again when a plugin actually asks for the grant, so
ticking the box and then adding a moderation permission does not slip
past it. To sell "members plus one private forum and a badge", make a
group that says exactly that and mark *it* grantable, never a group that
also moderates.

A `groups.expire` task tidies lapsed memberships every fifteen minutes.
It is housekeeping, not enforcement: access ended at the expiry.

## Promotions

`/admin/groups/promotions` moves members into a group once they have
earned it. The screen holds the rules, and beneath them a preview:
exactly who the rules would move if they ran this second, with nothing
written. The preview stops after a fixed number of members, oldest
accounts first, and says so; the scheduled task carries on past them.

A rule is:

- **A title**, for the preview and the admin log; members never see it.
- **Display order**: the first rule in this order that matches a member
  is the one applied, and no member is moved twice in a run.
- **Promote from**: a primary group, or *any group*.
- **Promote into**: the group that becomes their new primary group.
- **At least**: posts, [reputation](./reputation.md), days registered.
  Each is optional individually, and every one that is filled in must be
  met.

**A new rule is enabled straight away.** A `promotions.apply` task runs
**every hour**, reading at most ten thousand members per run and
resuming where the last run stopped, so on a larger board a newly earned
promotion can take more than one run to arrive. **Disable** is the
reversible way to stop a rule; **Remove** deletes it, asks for your
password again, and has no undo.

Two rules are refused outright:

- **A rule that promotes a group into itself** can never move anybody.
- **A rule with no criteria at all** matches every member it examines: a
  board-wide primary-group change on the next tick. If that is really
  what you want, set *posts* to `0`. Zero is accepted; blank is refused.

At run time, **a promotion never lifts a ban, never demotes, and never
re-applies to somebody already in the target group.** Members whose
primary group is Banned, Administrators or Super moderators are skipped
whatever a rule says, before any rank is considered. A promoted member
keeps every secondary membership they held.

The no-demotion guard reads a fixed table of ranks holding Guests,
Registered, Super moderators and Administrators. **A group it does not
rank, including every group you make, is not compared at all**, so a
rule promoting members out of Registered into one of your own groups runs
normally. What the guard refuses is a move between two groups it does
rank, in the wrong direction.

The preview runs the same evaluation as the task. **Run it** applies
exactly what the preview lists, asks for your password again, and
records the count in the admin log. Deleting the target group deletes
the rules that point at it.

## Moving members, and deleting a group

**`/admin/groups/memberships`** moves every member of one group into
another, **500 per press**, so a long run does not tie the board up. It
changes members' *primary* group, and is not reversible except by moving
them back.

**Deleting a group** asks which group its members move to, because every
member has a primary group, and asks for your password again. There is
no undo.
