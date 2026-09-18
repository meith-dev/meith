# Manage members and registration

Configure registration, welcome new members and manage their group memberships. Use a normal member account to check the result of permission changes.

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
> [Operations § Mail](../operations/mail.md).

The registration form also carries one optional, unticked box: whether
the board may e-mail the new member its announcements. It is the consent
[Mass mail](community-communications.md#mass-mail) runs on. Leaving it unticked costs the applicant
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
[Forums and permissions § What an appointment grants](forums.md).

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
| Backups — and proving a backup restores | [Backups](../operations/backups.md) — the schedule and the off-site bucket are settings you can turn on yourself; proving a restore still wants the terminal |
| Upgrading to a new version | [Upgrading a board](../operations/upgrading.md) |
| Setting up or changing how mail is sent | [Operations § Mail](../operations/mail.md) |
| Installing a theme or a plugin | [The theme API](../extensions/themes.md), [The plugin API](../extensions/plugins.md) |
| Recovering lost administrator access | [Operations § Account recovery](../operations/operator-cli.md#account-recovery) |

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
