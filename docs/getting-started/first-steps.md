# First steps

The installer has run, you have signed in with the account it created,
and the board is empty. This page is the first hour: what to do, in
order, and where each thing lives. Everything here happens in the
browser, in the admin panel at **`/admin`**.

The panel asks for your password a second time when you open it, and
again before anything destructive if more than fifteen minutes have
passed since you last confirmed it. That is deliberate: the panel keeps
a session of its own, separate from your board session.

## 1. Name the board and check the mail

The installer recorded the board's name and mail settings. Check both:

- **Board name** is under **`/admin/settings?group=board`**. It appears
  in the header, in every page title and on outgoing mail.
- **Mail** is the one thing harder to add later than now. Send yourself
  a test message from **`/admin/settings?group=mail`** before anyone
  registers; a board that requires an e-mailed confirmation link and
  cannot send it is a board nobody can join.
  [Operations § Mail](../operating/operating.md#mail) has the provider
  settings.

## 2. Create the forums

**Admin → Forums** (**`/admin/forums`**) shows the tree with an **Add
forum** form beneath it. A row is a *category* (a heading that holds
forums), a *forum* (holds threads) or a *link*. Drag rows to reorder or
nest them; a forum takes its subforums with it, and anything moved under
a new parent inherits that parent's permissions.

Start small. Three or four forums a new community can fill beat twenty
it cannot. [The organiser's guide § Shaping the
board](../using/organiser-guide.md#shaping-the-board) covers the options
on each forum, and [Forums and permissions](../using/forums.md) covers
who may see and do what inside one.

## 3. Decide who may join

**`/admin/settings?group=registration`** holds the two settings that
decide how people join:

- **Allow new registrations** switches the Register link on or off.
- **Activation method** is what a new account must do before it can
  sign in: nothing, follow an e-mailed link, wait for an administrator's
  approval, or both.

Spam controls, including the registration questions, live under
**Admin → Anti-spam**. The defaults are sensible; read
[Spam controls and filters](../using/antispam.md) before loosening any.

## 4. Appoint the staff

Rights come from group memberships. Every board starts with the same
seeded groups, and you add your own beside them. To give somebody a role,
open their account under **Admin → Users** and tick the group under
**Additional groups**. To make somebody a moderator of one forum, open
the forum under **Admin → Forums** and appoint them there, ticking the
rights they should hold.

Keep more than one administrator, and never share an account: the admin
log records who did what, and a shared login makes that record
worthless. [Groups and promotions](../using/groups.md) and
[The moderator's guide](../using/moderation-guide.md) go further.

## 5. Make it look like yours

**Admin → Themes** holds the logo, the icons, the colours and the fonts,
and members pick their own theme from the ones the board ships. Nothing
in this step needs a redeploy. Announcements and the navigation menu live
under **Admin → Content**.
[The organiser's guide § Making the board look like
yours](../using/organiser-guide.md#making-the-board-look-like-yours) walks
through each.

## 6. Switch the backups on

A board accumulates years of a community's writing, and the backup is
the only way back from a bad day. Two settings under **Admin → Settings →
Backups** turn on a schedule and a retention count; a third ships the
bundles to a bucket off the server. **Admin → System → Backups** takes
one now and lists what exists.

Do this today, then hand [Backups](../operating/backups.md) to whoever
minds the server so a restore is rehearsed once.

## 7. Invite people

Post a welcome thread, then send the address out. A member who has not
posted yet sees a short, dismissible sequence of prompts, and the
composer links to a **Rules & FAQ** page once you write one at
**`/admin/settings?group=legal`**.

## After the first hour

- [The organiser's guide](../using/organiser-guide.md) is the day-to-day
  reference for everything above.
- [Installing plugins and themes](./installing.md) adds memberships,
  a calendar or a new look. It is a code change and a redeploy, so it
  goes to whoever set the board up.
- [Configuration in code](./configuration.md) explains what lives in the
  board repository and what stays in the panel.
- [Operations](../operating/operating.md) is the handbook for the person
  minding the server.
