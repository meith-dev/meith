# The organiser's guide

For the people who run a community's board day to day: the admin, the
committee, the club secretary, the person who "looks after the website".
Everything here happens in a browser, in the board's admin panel. Nothing
here needs a terminal, and the one section that would is the
[last one](#when-to-hand-it-to-somebody-technical) — it tells you what to
hand to whoever set the board up.

Two jobs have guides of their own: keeping threads civil is
[The moderator's guide](./moderation-guide.md), and taking the money is
[The memberships guide](./membership-guide.md). The full operator
handbook is [Operations](../operations/operating.md) — this guide covers the
day-to-day subset and links there for the detail.

## The admin panel

The panel lives at **`/admin`**. Opening it asks for your password a
second time, even though you are already signed in. That is not a bug:
the panel keeps a session of its own, separate from your board session,
so a browser left signed in to the board is not also signed in to the
panel. The panel session lapses after 30 minutes idle, and after 8 hours
regardless.

The panel's header has one way out: **Sign out of admin panel** ends the
panel session and returns you to the board. The next visit to `/admin`
asks for your password again. Your board session is untouched — you stay
signed in to the forum.

Inside it, anything destructive — deleting a group, rewriting the
permissions of forums you are not looking at — asks for your password
*again* if it is more than fifteen minutes since you last confirmed it.
Expect the prompt; it is the panel being careful, not broken.

The panel opens on an **Overview**: what is waiting for you, the board's
totals, and the latest administrative activity. The sections this guide
uses:

| Section | What lives there |
|---|---|
| **Board settings** | Every setting, grouped and searchable — the board's name, registration, mail |
| **Forums** | The forum tree, each forum's options, and who may see what |
| **Groups** | What each group allows, promotions, mass membership changes |
| **Users** | Find an account, change it, or mail the board |
| **Content** | Announcements, attachments, and the navigation menu |
| **Themes** | The logo, colours and fonts |
| **Admin log** | Every administrative and moderation action, with who and from where |

Who can open the panel at all is one permission, granted per group, and
it is the one right the administrator shortcuts never bypass. In
practice: members of the **Administrators** group have it, and nobody
else does until you decide otherwise.

## Shaping the board

### Creating a forum

**Admin → Forums** (**`/admin/forums`**) shows the tree, with an **Add
forum** form beneath it. A new row asks three things:

- **Kind** — a *category* (a heading that holds forums), a *forum*
  (holds threads), or a *link* (redirects elsewhere).
- **Inside** — which category or forum it sits under, or the top level.
- **Title**.

Click into a forum afterwards for the rest: a description, the slug that
appears in its links, and its options — open for posting, allow new
threads, replies, polls and attachments, require a thread prefix, and
whether new threads or replies are held for approval.

### Arranging the tree

The tree screen is where the order is decided. Drag a row by its handle:
up and down to reorder, sideways to change how deep it sits. Each row
also carries four arrow buttons that do the same thing without a mouse.

Three things to know before you drag:

- A forum takes its subforums with it. They move as a block.
- What lands somewhere new inherits its permissions from where it
  landed — so moving a busy forum under a private category hides the
  whole subtree. The screen says so under the tree.
- Reordering among the same siblings never asks for your password;
  moving a forum under a *different* parent does, because it changes who
  can see what.

The detail is in
[Forums and permissions § The forum tree](./forums.md#the-forum-tree).

### A private forum for the organisers

Most boards want one forum only the people running the place can read —
call it the committee room, the staff room or the back office. The
shape of it:

1. **Make an Organisers group** — named whatever your community calls
   its own: Committee, Staff, Officers. **Admin → Groups → Create
   group**. The form asks which group to copy permissions from — copy
   **Registered**, so its members start as ordinary members plus
   whatever you add.
2. **Put people in it.** On each person's screen under **Admin →
   Users**, tick the group under **Additional groups**. An additional
   group only ever adds rights; it takes nothing away.
3. **Make the forum**, then open its **Permissions** screen. Permissions
   are set per group, per forum: for this forum, deny viewing to the
   ordinary member groups (and Guests), and grant it to your new group.

Three things worth knowing before you touch the permissions screen:

> [!IMPORTANT]
> In the forum permissions matrix, **an empty cell means "inherit"** —
> it is not the same as "no". Each cell shows what it currently resolves
> to and where that answer came from, so read what is there before
> changing it, and set only the cells you mean. The full explanation is
> in [Forums and permissions § Permissions](./forums.md#permissions).

> [!IMPORTANT]
> **Deny is per group, not board-wide.** Denying a cell for one group
> only removes that group's contribution; a member who is also in a group
> that grants it still has it. That is why step 3 says deny it to *every*
> ordinary group, Guests included.

Administrators see the forum whatever the matrix says — the bypass
exists so a board can always be repaired, and every use of it is written
to the server's log (not the admin log at `/admin/log`).

A related trick: a forum where members can post but only see their *own*
threads — applications, welfare matters, anything written to the
organisers rather than to the room — is one permission, described in
[Forums and permissions § A "your threads only" forum](./forums.md#a-your-threads-only-forum).

## Making the board look like yours

Everything in this section changes on the running board, from the panel,
with nothing redeployed.

### The name

The board's name — in the header, in every page title, and on outgoing
mail — is **Board name** under **`/admin/settings?group=board`**. There
is nowhere else it is written down, so changing it there changes it
everywhere.

### The logo

**Admin → Themes** (**`/admin/themes`**) takes a logo to show in place
of the name, as **two uploads: light and dark** — one image that reads
on a white page usually disappears on a black one. Upload only the light
one and it is used everywhere. PNG, JPEG, WebP or SVG, up to 512 KiB.

With no logo, the header shows the board's name in text — which is where
every board starts and where most stay. The logo's alt text, for screen
readers, is **Logo alt text** under the board settings; left empty it
becomes the board's name.

### The tab icon, home-screen icon and shared links

The browser-tab icon (favicon), the icon a phone saves when someone adds
the board to their home screen, and the picture that appears when a board
link is pasted into a chat or posted to a social network are **drawn from
what you have already set** — the board name, the default theme's colours,
and the logo when there is one — unless you upload a favicon of your own.

- The **favicon** is **Favicon** under **`/admin/settings?group=board`**,
  the same square icon field the logo sits beside on the themes page —
  PNG, JPEG, WebP or SVG, up to 512 KiB. Leave it empty and the **tab
  icon** is a small square with the board's initials in the theme's
  primary colour, following the reader's light or dark mode; upload one
  and it is shown instead.
- The **home-screen icon** — the board installs as a progressive web app
  — uses the uploaded favicon when it is a PNG or JPEG, otherwise the
  light logo, otherwise the initials, centred on the theme background.
- The **link preview** (Open Graph and X/Twitter card) shows the logo,
  the board name and its description on the theme background.

Change the name, upload a favicon or a logo, or set a new default theme
and all of these follow at once; there is no separate step and no cache to
clear. The raster home-screen icons are drawn from a PNG or JPEG only — an
SVG or WebP favicon still shows in the browser tab, and the home-screen
icons fall back to the logo, then to the board's initials and name.

Installing is something a reader has to discover in their browser's menu,
so the board can point at it for you: **Offer to install the board**, under
**`/admin/settings?group=board`**, pins a dismissable bar to the bottom of
small screens inviting the reader to add the board to their home screen —
with an Install button that opens the browser's own prompt where one
exists, and brief directions where none does. It never shows inside the
installed app, dismissing it keeps it away on that device for a year, and
it is off by default: turn it on while you want installs encouraged, and
off again once the point is made.

### Colours, fonts and themes

The same **Admin → Themes** screen holds, per theme:

- **On or off** — an enabled theme appears in the appearance control at
  the foot of every page, and any member can pick it for themselves.
- **The default** — what a visitor who has chosen nothing sees.
- **Token values** — colours, corner radius, spacing and fonts, each
  with separate light and dark values, with a sample that repaints as
  you change them.
- **Export and import** — a look can be saved as a file and moved to
  another board.

Most controls here are freely reversible. **Reset** and **Import** are
the exceptions — each replaces every stored override in one press — so
both ask for your password again.

If your community has a crest and two colours — a sports club, say —
the shipped **clubhouse** theme is built for exactly that: set the main
colour and the trim colour on the theme screen and everything else
stays neutral. With no logo uploaded it draws a crest from the board's
name.

> [!NOTE]
> *Configuring* a theme is yours; *installing* a new one is not. A theme
> is part of the deployed code, so adding one is a deploy — see the
> [last section](#when-to-hand-it-to-somebody-technical).

## Telling people things

### Announcements

**Admin → Content → Announcements** puts a dated notice above the
forums. An announcement is not a pinned thread: nobody can reply to one,
it disappears on its own end date, and removing it removes nothing
anybody wrote — which is what makes it safe to delete when it is stale.

Each one has a title, a Markdown message (rendered the same way a post
is), a **From** date, an optional **Until** date (blank never expires),
and a place: **the whole board**, or one forum — a forum's announcement
is shown to whoever can see that forum, so an announcement on the
organisers' forum reaches only the organisers. Dates are entered in UTC,
and the screen says so. The list shows each announcement's state at a
glance: showing now, scheduled, expired, or switched off.

### The navigation menu

**Admin → Content → Navigation** is the menu across the top of every
page. A new board starts with eight items — Home, New posts, Unanswered,
My posts, Search, Who's online, Members and Staff — and they are
ordinary rows: rename one, move it, hide it, or delete it, and add links
of your own beside them. A link can point at a page on the board or at
any web address — the community's main site, the fixtures list, an
events calendar.

Each item can be shown to everyone, only signed-out visitors, only
signed-in members, or only staff — and, more narrowly, only to members
of groups you tick. Items can be nested one level deep into sub-menus by
dragging.

### The member list and the staff page

**`/members`** lists every account on the board — searchable by name,
sortable by name, post count or newest arrival — with each member's
displayed groups beside their name. It is shown to anyone whose groups
carry the *Browse the member list* permission, which every shipped group
grants; untick it on Guests to keep the list to signed-in members.

**`/staff`** is the other half of the [staff group flag](./groups.md#how-a-group-looks):
every group marked as a staff group appears there in its display order,
listing everyone who holds it — by primary group or live membership.
A staff group nobody is in stays off the page.

### Mass mail

**Admin → Users → Mass mail** (**`/admin/users/mail`**) sends an e-mail
to everybody, or to one group — the Committee group from earlier, say.
Either way it reaches only accounts that are active, not closed, have a
verified address **and have asked the board for its announcements**, and
the screen shows the size of each audience beside it, so the figure next
to a group is how many messages choosing it will queue.

That last condition is the important one, and it is why a brand-new
board's audience is nought. Nobody is enrolled by registering. A member
asks for announcements by ticking the box on the registration form, or
later on their own **Notifications → Preferences** screen; both start
unticked, and the board records the date consent was given. Every
message carries an unsubscribe link at its foot, so a member can stop
them from the message itself, without signing in — and once they do,
they are out of every campaign that follows, including one already half
sent.

So mass mail is the wrong tool for anything every member must see: it
reaches the members who asked, not the membership. A pinned thread or an
[announcement](#announcements) reaches everybody who visits.

Mass mail is queued and delivered in the background, so it needs the
board's mail working and its background worker running — if a mass mail
sits unsent, that is one for the technical person, and
[Operations § Mail](../operations/operating.md#mail) is their page.

### Closing for maintenance

**Board offline**, under **`/admin/settings?group=board`**, replaces
every board page with a message of your choosing until you switch it
back. Signing in and the admin panel stay reachable, so you can always
turn it off again.

## Welcoming and managing members

### Registration

**`/admin/settings?group=registration`** holds the two settings that
decide how people join:

- **Allow new registrations** — off closes the board to new members:
  the Register link goes, and the registration page says the board is
  not taking new members. Existing members sign in as before, so it is
  the switch to reach for during a spam wave, or for a board that is
  meant to be invitation-only.
- **Activation method** — what a new account must do before it can sign
  in: nothing, follow an e-mailed confirmation link, wait for an
  administrator's approval, or both.

> [!IMPORTANT]
> Requiring an e-mailed link on a board whose mail is not working is a
> board nobody can join — the links are minted and never delivered. The
> registration settings screen warns loudly while this is true. If you
> see that warning, mail is the thing to fix first — see
> [Operations § Mail](../operations/operating.md#mail).

The registration form also carries one optional, unticked box: whether
the board may e-mail the new member its announcements. It is the consent
[Mass mail](#mass-mail) runs on. Leaving it unticked costs the applicant
nothing, and a member can change their mind either way at any time from
**Notifications → Preferences**.

Registration questions and the other anti-spam controls live at
**Admin → Anti-spam**.

An account stuck at "awaiting activation" — the member who never
received their link — can be activated by hand: find them under
**Admin → Users** and change the state on their screen.

The user list also supports selecting up to 500 accounts on the current
page. A selection can be banned with one shared staff reason, added to an
additional group, or sent to the prune review screen. Pruning never closes
accounts from the list itself: the review rechecks that each account has no
content, ban or staff role, lists the eligible accounts, and asks for fresh
admin authentication before closing them.

Reversible user actions show an **Undo** control for ten minutes. The undo
belongs to the administrator who performed the action, works once, and is
recorded in the admin log. Actions that discard content or credentials —
including pruning, merging accounts and clearing a second factor — stay
confirmation-only because recreating the previous state would be misleading
or unsafe.

### Onboarding new members

A member who has not posted yet sees a light, dismissible sequence of
prompts, in order: a welcome notice below the header, then — once that
is dismissed — a nudge to add an avatar and a bio if either is still
missing, then, the first time they open the composer, a short notice
above the form. None of it blocks posting, none of it needs
JavaScript, and each prompt is remembered per browser once dismissed —
it dismisses through a plain link, so it also works with JavaScript
off. A member stops seeing all of it the moment they post.

The composer notice links to a **Rules & FAQ** page when one is
published. Write it at **`/admin/settings?group=legal`**, alongside
the terms of service and privacy policy — like those two, it is
Markdown, it is linked from the footer once non-empty, and it is
unpublished (and the composer notice drops its link) while empty. It
ships empty: there is no default text to edit around.

### Roles are group memberships

A member's rights come from the groups they are in. Every board starts
with the same seeded groups — Guests, Registered, Administrators, Super
Moderators, Moderators, Awaiting Activation, Banned — and you add your
own beside them, like the Committee group above. Each member has one
**primary** group and any number of **additional** ones, and both are
edited on the member's screen under **Admin → Users**.

Making somebody a moderator of one forum does not need a group at all:
open the forum under **Admin → Forums** and appoint them there, ticking
exactly the rights they should hold, optionally cascading to the forums
beneath. Approving content, editing, deleting, restoring, locking,
pinning, moving, merging and splitting are each a separate grant: ticking
*Delete posts* does not give the undo, so tick *Restore posts* too if
you mean both. A moderator sees exactly what they hold, forum by forum,
under **`/modcp/forums`**. What each of the nine ticks decides is in
[Forums and permissions § What an appointment grants](./forums.md#what-an-appointment-grants).

Promotions that members *earn* — a "Veteran" group at 500 posts — can be
automated under **Admin → Groups → Promotions**; the screen previews
exactly who a rule would move before you enable it, and the button under
that preview promotes exactly the members it lists. The preview reads
the whole membership rather than a sample, which is not a cheap screen
on a large board: it stops after 50,000 members and says on the page
that it stopped, rather than keeping you waiting past that.

An enabled rule also runs on its own, hourly, and pressing the button
does not disturb that. The hourly task works through the membership
10,000 members at a time and keeps its own place between runs, so on a
board bigger than that a newly earned promotion arrives within a few
runs rather than on the very next one.

### When somebody steps back

Accounts belong to people; roles are group memberships. That one
sentence is most of a clean handover:

- **Never share an account or a password.** Each organiser acts
  from their own account, because the admin log records who did what,
  and a shared login makes that record worthless.
- **When somebody leaves**, take the *roles* off their *account*: remove
  them from the Organisers group (and any staff group) on their member
  screen, and remove any forum appointments on the forum screens. Their
  account, their posts and their name stay theirs — they have simply
  become an ordinary member again.
- **When somebody joins**, add their own existing account to the groups
  and appointments the role carries. There is nothing to hand over but
  the group memberships.

Keep more than one administrator. If the only administrator's account is
ever lost, recovery is possible but needs the technical person — it is
done from the server, not from the panel.

## When to hand it to somebody technical

Some jobs are about the machine the board runs on rather than the board,
and they need the terminal. Hand these to whoever set the board up, with
the page they need:

| Job | Their page |
|---|---|
| Backups — and proving a backup restores | [Operations § Backup](../operations/operating.md#backup) |
| Upgrading to a new version | [Upgrading a board](../operations/upgrading.md) |
| Setting up or changing how mail is sent | [Operations § Mail](../operations/operating.md#mail) |
| Installing a theme or a plugin | [The theme API](../../customization/themes.md), [The plugin API](../../customization/plugins.md) |
| Recovering lost administrator access | [Operations § Account recovery](../operations/operating.md#account-recovery) |

Deciding *what* to install is yours, even when installing it is not. The
public marketplace at [meith.dev/marketplace](https://www.meith.dev/marketplace)
is a page per plugin and theme — what each does, its screenshots, and the
exact command line whoever has the terminal will need. Your own board
watches the same catalog for you: **Admin → Plugins** and **Admin →
Themes** mark anything already installed **Update available** when a newer,
compatible version is listed, so you learn what is worth chasing without
browsing anything. Neither installs anything, so both cost nothing and
need nobody technical yet.

One of these is worth chasing rather than filing: **backups**. A board
accumulates years of a community's writing, and the backup is the only
way back from a bad day. Ask the person who runs the server two
questions — is the database *and* the uploads folder being backed up
somewhere off the machine, and has a restore ever been rehearsed. If
either answer is no, point them at the page above.
