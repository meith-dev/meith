# The organiser's guide

For the people who run a community's board day to day: the admin, the
committee, the club secretary, the person who "looks after the website".
Everything here happens in a browser, in the board's admin panel. The
[last section](#when-to-hand-it-to-somebody-technical) lists the jobs
that need a terminal and who to hand them to.

Keeping threads civil is [The moderator's guide](./moderation-guide.md);
taking the money is [The memberships guide](./membership-guide.md); the
full operator handbook is [Operations](../operating/operating.md).

## The admin panel

The panel lives at **`/admin`**. Opening it asks for your password a
second time, because the panel keeps a session of its own, separate from
your board session. The panel session lapses after 30 minutes idle, and
after 8 hours regardless. **Sign out of admin panel**, in the panel's
header, ends the panel session and leaves your board session untouched.

Anything destructive, such as deleting a group or rewriting the
permissions of forums you are not looking at, asks for your password
again if it is more than fifteen minutes since you last confirmed it.

The panel opens on an **Overview**: what is waiting for you, the board's
totals, and the latest administrative activity. Its sections:

| Section | What lives there |
|---|---|
| **Board settings** | Every setting, grouped and searchable: the board's name, registration, mail |
| **Forums** | The forum tree, each forum's options, and who may see what |
| **Groups** | What each group allows, promotions, mass membership changes |
| **Users** | Find an account, change it, or mail the board |
| **Content** | Announcements, attachments, and the navigation menu |
| **Anti-spam** | Registration questions; the thresholds themselves are under Board settings (`/admin/settings?group=antispam`) |
| **Themes** | The logo, colours and fonts |
| **Plugins** | What is installed, and each plugin's own screens |
| **API tokens** | Tokens for the board's API, at `/admin/api-tokens` |
| **Webhooks** | Where the board sends notice of events, at `/admin/webhooks`; see [Webhooks](../operating/webhooks.md) |
| **System** | Scheduled tasks, the queue and reindex progress at `/admin/system`; backups at `/admin/system/backups`, see [Backups](../operating/backups.md) |
| **Admin log** | Every administrative and moderation action, with who and from where |
| **Sign-in activity** | Sign-ins and sign-in attempts, at `/admin/security` |

Who can open the panel is one permission, granted per group, and it is
the one right the administrator shortcuts never bypass. Members of the
**Administrators** group have it, and nobody else does until you decide
otherwise.

## Shaping the board

### Creating a forum

**Admin → Forums** (**`/admin/forums`**) shows the tree, with an **Add
forum** form beneath it. A new row asks three things:

- **Kind**: a *category* (a heading that holds forums), a *forum*
  (holds threads), or a *link* (redirects elsewhere).
- **Inside**: which category or forum it sits under, or the top level.
- **Title**.

Click into a forum afterwards for the rest: a description, the slug that
appears in its links, and its options: open for posting, allow new
threads, replies, polls and attachments, require a thread prefix, and
whether new threads or replies are held for approval.

### Arranging the tree

Drag a row by its handle: up and down to reorder, sideways to change how
deep it sits. Each row also carries four arrow buttons that do the same
without a mouse. Three things to know before you drag:

- A forum takes its subforums with it. They move as a block.
- What lands somewhere new inherits its permissions from where it
  landed, so moving a busy forum under a private category hides the
  whole subtree. The screen says so under the tree.
- Reordering among the same siblings never asks for your password.
  Moving a forum under a *different* parent does, because it changes who
  can see what.

The detail is in
[Forums and permissions § The forum tree](./forums.md#the-forum-tree).

### A private forum for the organisers

Most boards want one forum only the people running the place can read.
The shape of it:

1. **Make an Organisers group**, named whatever your community calls
   its own: Committee, Staff, Officers. **Admin → Groups → Create
   group** asks which group to copy permissions from. Copy
   **Registered**, so its members start as ordinary members plus
   whatever you add.
2. **Put people in it.** On each person's screen under **Admin →
   Users**, tick the group under **Additional groups**. An additional
   group only ever adds rights; it takes nothing away.
3. **Make the forum**, then open its **Permissions** screen. Permissions
   are set per group, per forum: for this forum, deny viewing to the
   ordinary member groups (and Guests), and grant it to your new group.

> [!IMPORTANT]
> In the forum permissions matrix, **an empty cell means "inherit"**.
> It is not the same as "no". Each cell shows what it currently resolves
> to and where that answer came from, so read what is there before
> changing it, and set only the cells you mean. The full explanation is
> in [Forums and permissions § Permissions](./forums.md#permissions).

> [!IMPORTANT]
> **Deny is per group, not board-wide.** Denying a cell for one group
> only removes that group's contribution; a member who is also in a group
> that grants it still has it. That is why step 3 says deny it to *every*
> ordinary group, Guests included.

Administrators see the forum whatever the matrix says, so a board can
always be repaired. Every use of that bypass is written to the server's
log, not the admin log at `/admin/log`.

A forum where members can post but only see their *own* threads
(applications, welfare matters) is one permission, described in
[Forums and permissions § A "your threads only" forum](./forums.md#a-your-threads-only-forum).

## Making the board look like yours

Everything in this section changes on the running board, from the panel,
with nothing redeployed.

### The name

The board's name, in the header, in every page title and on outgoing
mail, is **Board name** under **`/admin/settings?group=board`**. It is
written down nowhere else.

### The logo

**Admin → Themes** (**`/admin/themes`**) takes a logo to show in place
of the name, as **two uploads: light and dark**, because an image that
reads on a white page usually disappears on a black one. Upload only the
light one and it is used everywhere. PNG, JPEG, WebP or SVG, up to
512 KiB. With no logo, the header shows the board's name in text.

The logo's alt text, for screen readers, is **Logo alt text** under the
board settings; left empty it becomes the board's name.

### The tab icon, home-screen icon and shared links

The browser-tab icon (favicon), the icon a phone saves when someone adds
the board to their home screen, and the picture shown when a board link
is pasted into a chat or a social network are drawn from what you have
already set: the board name, the default theme's colours, and the logo
when there is one.

- The **favicon** is **Favicon** under **`/admin/settings?group=board`**,
  separate from the logo uploads on the themes page: PNG, JPEG, WebP or
  SVG, up to 512 KiB. Leave it empty and the tab icon is a small square
  with the board's initials in the theme's primary colour, following the
  reader's light or dark mode.
- The **home-screen icon** (the board installs as a progressive web app)
  uses the uploaded favicon when it is a PNG or JPEG, otherwise the
  light logo, otherwise the initials, centred on the theme background.
  An SVG or WebP favicon still shows in the browser tab; the raster
  home-screen icons are drawn from a PNG or JPEG only.
- The **link preview** (Open Graph and X/Twitter card) shows the logo,
  the board name and its description on the theme background.

Change the name, upload a favicon or a logo, or set a new default theme
and all of these follow at once, with no cache to clear.

**Offer to install the board**, under **`/admin/settings?group=board`**,
pins a dismissable bar to the bottom of small screens inviting the
reader to add the board to their home screen, with an Install button
that opens the browser's own prompt where one exists and brief
directions where none does. It never shows inside the installed app,
dismissing it keeps it away on that device for a year, and it is off by
default. Turn it on while you want installs encouraged, and off again
once the point is made.

### Colours, fonts and themes

The same **Admin → Themes** screen holds, per theme:

- **On or off**: an enabled theme appears in the appearance control at
  the foot of every page, and any member can pick it for themselves.
- **The default**: what a visitor who has chosen nothing sees.
- **Token values**: colours, corner radius, spacing and fonts, each
  with separate light and dark values, with a sample that repaints as
  you change them.
- **Export and import**: a look can be saved as a file and moved to
  another board.

**Reset** and **Import** each replace every stored override in one
press, so both ask for your password again.

If your community has a crest and two colours, the shipped **clubhouse**
theme is built for that: set the main colour and the trim colour on the
theme screen and everything else stays neutral. With no logo uploaded it
draws a crest from the board's name.

> [!NOTE]
> *Configuring* a theme is yours; *installing* a new one is not. A theme
> is part of the deployed code, so adding one is a deploy. See the
> [last section](#when-to-hand-it-to-somebody-technical).

## Telling people things

### Announcements

**Admin → Content → Announcements** puts a dated notice above the
forums. An announcement is not a pinned thread: nobody can reply to one,
it disappears on its own end date, and removing it removes nothing
anybody wrote.

Each one has a title, a Markdown message (rendered the same way a post
is), a **From** date, an optional **Until** date (blank never expires),
and a place: **the whole board**, or one forum. A forum's announcement
is shown to whoever can see that forum. Dates are entered in UTC, and
the screen says so. The list shows each announcement's state: showing
now, scheduled, expired, or switched off.

### The navigation menu

**Admin → Content → Navigation** is the menu across the top of every
page. A new board shows three items, Home, New posts and Search, and
keeps the board's other five pages on the screen beside them, hidden:
Unanswered, My posts, Who's online, Members and Staff. Tick **Shown in
the menu** on any of them to add it. All eight are ordinary rows: rename
one, move it, hide it, or delete it, and add links of your own beside
them, to a page on the board or to any web address.

Each item can be shown to everyone, only signed-out visitors, only
signed-in members, or only staff, and more narrowly to members of groups
you tick. Items can be nested one level deep into sub-menus by dragging.

### The member list and the staff page

**`/members`** lists every account on the board, searchable by name and
sortable by name, post count or newest arrival, with each member's
displayed groups beside their name. It is shown to anyone whose groups
carry the *Browse the member list* permission. Every shipped group
grants it except Awaiting Activation and Banned; untick it on Guests to
keep the list to signed-in members.

**`/staff`** is the other half of the [staff group flag](./groups.md#how-a-group-looks):
every group marked as a staff group appears there in its display order,
listing everyone who holds it by primary group or live membership. A
staff group nobody is in stays off the page.

### Mass mail

**Admin → Users → Mass mail** (**`/admin/users/mail`**) sends an e-mail
to everybody, or to one group. Either way it reaches only accounts that
are active, not closed, have a verified address **and have asked the
board for its announcements**. The screen shows the size of each
audience beside it: how many messages choosing it will queue.

Nobody is enrolled by registering, which is why a brand-new board's
audience is nought. A member asks for announcements by ticking the box
on the registration form, or later on their own **Notifications →
Preferences** screen; both start unticked, and the board records the
date consent was given. Every message carries an unsubscribe link at its
foot, which works without signing in and takes the member out of every
campaign that follows, including one already half sent.

So mass mail reaches the members who asked, not the membership. For
anything every member must see, a pinned thread or an
[announcement](#announcements) reaches everybody who visits.

Mass mail is queued and delivered in the background, so it needs the
board's mail working and its background worker running. If a mass mail
sits unsent, that is one for the technical person:
[Operations § Mail](../operating/operating.md#mail).

### Board activity digest

Every member's **Notifications → Preferences** screen lists a **board
activity digest**, off by default like every other e-mail there. A
member who turns it on also picks **weekly** or **monthly** from the box
beside it.

The digest is aimed at members who have drifted away. A member is due
one only once they have not visited for a run of days you set, **Admin
→ Settings → Board → "Board digest: days away before a member counts as
lapsed"**, seven days out of the box, and only when their chosen cadence
has elapsed. A member who reads the board most days never gets one.

It lists the busiest threads since that member's own last visit, under
the same forum permissions that decide what they can open, so two
members turned lapsed on the same day can receive two different digests,
and neither sees a thread in a forum closed to them. Every digest carries
its own unsubscribe link, and using it switches off only the board
digest; every other notification preference, and the account, are
untouched.

### Closing for maintenance

**Board offline**, under **`/admin/settings?group=board`**, replaces
every board page with a message of your choosing until you switch it
back. Signing in and the admin panel stay reachable, so you can always
turn it off again.

## Welcoming and managing members

### Registration

**`/admin/settings?group=registration`** holds the two settings that
decide how people join:

- **Allow new registrations**: off closes the board to new members. The
  Register link goes, and the registration page says the board is not
  taking new members. Existing members sign in as before, so it is the
  switch to reach for during a spam wave, or for an invitation-only
  board.
- **Activation method**: what a new account must do before it can sign
  in. Nothing, follow an e-mailed confirmation link, wait for an
  administrator's approval, or both.

> [!IMPORTANT]
> Requiring an e-mailed link on a board whose mail is not working is a
> board nobody can join: the links are minted and never delivered. The
> registration settings screen warns loudly while this is true. If you
> see that warning, mail is the thing to fix first. See
> [Operations § Mail](../operating/operating.md#mail).

The registration form also carries one optional, unticked box: whether
the board may e-mail the new member its announcements. It is the consent
[Mass mail](#mass-mail) runs on, and a member can change it at any time
from **Notifications → Preferences**.

Registration questions live at **Admin → Anti-spam**; the anti-spam
thresholds live at **`/admin/settings?group=antispam`**.

An account stuck at "awaiting activation" can be activated by hand: find
them under **Admin → Users** and change the state on their screen.

The user list also supports selecting up to 500 accounts on the current
page. A selection can be banned with one shared staff reason, added to an
additional group, or sent to the prune review screen. Pruning never closes
accounts from the list itself: the review rechecks that each account has no
content, ban or staff role, lists the eligible accounts, and asks for fresh
admin authentication before closing them.

Reversible user actions show an **Undo** control for ten minutes. The undo
belongs to the administrator who performed the action, works once, and is
recorded in the admin log. Actions that discard content or credentials,
including pruning, merging accounts and clearing a second factor, stay
confirmation-only because recreating the previous state would be misleading
or unsafe.

### Onboarding new members

A member who has not posted yet sees a light, dismissible sequence of
prompts, in order: a welcome notice below the header; once that is
dismissed, a nudge to add an avatar and a bio if either is still
missing; then, the first time they open the composer, a short notice
above the form. None of it blocks posting, each prompt dismisses through
a plain link so it works with JavaScript off, and each is remembered per
browser once dismissed. A member stops seeing all of it the moment they
post.

The composer notice links to a **Rules & FAQ** page when one is
published. Write it at **`/admin/settings?group=legal`**, alongside the
terms of service and privacy policy. Like those two, it is Markdown, it
is linked from the footer once non-empty, and it is unpublished (and the
composer notice drops its link) while empty. It ships empty.

### Roles are group memberships

A member's rights come from the groups they are in. Every board starts
with the same seeded groups, Guests, Registered, Administrators, Super
Moderators, Moderators, Awaiting Activation and Banned, and you add your
own beside them. Each member has one **primary** group and any number of
**additional** ones, both edited on the member's screen under **Admin →
Users**.

Making somebody a moderator of one forum does not need a group at all:
open the forum under **Admin → Forums** and appoint them there, ticking
exactly the rights they should hold, optionally cascading to the forums
beneath. Approving content, editing, deleting, restoring, locking,
pinning, moving, merging and splitting are each a separate grant: ticking
*Delete posts* does not give the undo, so tick *Restore posts* too if
you mean both. A moderator sees what they hold, forum by forum, under
**`/modcp/forums`**. What each of the nine ticks decides is in
[Forums and permissions § What an appointment grants](./forums.md#what-an-appointment-grants).

Promotions that members *earn*, a "Veteran" group at 500 posts say, can
be automated under **Admin → Groups → Promotions**. The screen previews
exactly who a rule would move before you enable it, and the button under
that preview promotes exactly the members it lists. The preview reads
the whole membership, so on a large board it stops after 50,000 members
and says on the page that it stopped.

An enabled rule also runs on its own, hourly, and pressing the button
does not disturb that. The hourly task works through the membership
10,000 members at a time and keeps its place between runs, so on a board
bigger than that a newly earned promotion arrives within a few runs.

### When somebody steps back

Accounts belong to people; roles are group memberships.

- **Never share an account or a password.** Each organiser acts from
  their own account, because the admin log records who did what, and a
  shared login makes that record worthless.
- **When somebody leaves**, take the *roles* off their *account*: remove
  them from the Organisers group (and any staff group) on their member
  screen, and remove any forum appointments on the forum screens. Their
  account, their posts and their name stay theirs.
- **When somebody joins**, add their own existing account to the groups
  and appointments the role carries.

Keep more than one administrator. If the only administrator's account is
ever lost, recovery is possible but needs the technical person, because
it is done from the server, not from the panel.

## When to hand it to somebody technical

Some jobs are about the machine the board runs on rather than the board,
and they need the terminal. Hand these to whoever set the board up, with
the page they need:

| Job | Their page |
|---|---|
| Backups, and proving a backup restores | [Backups](../operating/backups.md). The schedule and the off-site bucket are settings you can turn on yourself; proving a restore still wants the terminal |
| Upgrading to a new version | [Upgrading a board](../operating/upgrading.md) |
| Setting up or changing how mail is sent | [Operations § Mail](../operating/operating.md#mail) |
| Installing a theme or a plugin | [The theme API](../developing/themes.md), [The plugin API](../developing/plugins.md) |
| Recovering lost administrator access | [Operations § Account recovery](../operating/operating.md#account-recovery) |

Deciding *what* to install is yours, even when installing it is not. The
public marketplace at [meith.dev/marketplace](https://www.meith.dev/marketplace)
is a page per plugin and theme: what each does, its screenshots, and the
exact command line whoever has the terminal will need. **Admin →
Plugins** and **Admin → Themes** watch the same catalog and mark anything
already installed **Update available** when a newer, compatible version
is listed. Neither installs anything.

**Backups** are worth chasing rather than filing: the backup is the only
way back from a bad day. Ask the person who runs the server two
questions: is the database *and* the uploads folder being backed up
somewhere off the machine, and has a restore ever been rehearsed. If
either answer is no, point them at the page above.
