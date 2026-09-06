# Forums and permissions

The board's shape, and who may do what inside it. Three screens carry all
of it: **`/admin/forums`** draws the tree, **`/admin/forums/[id]`** holds
one forum's options and its moderators, and
**`/admin/forums/[id]/permissions`** holds the matrix for that forum.

For the task-shaped version, read
[The organiser's guide](./organiser-guide.md). What a *group* is worth
board-wide is in [Groups and promotions](./groups.md).

## The forum tree

`/admin/forums` draws the tree in the order the board renders it, and is
where the order is decided. An **Add forum** form sits beneath it.

A row is one of three kinds, and the kind decides what it can hold:

| Kind | Holds threads | Holds forums |
|---|---|---|
| **Category**, a heading | Only if **Allow new threads** is on | Yes |
| **Forum** | Yes | Yes |
| **Link**, a redirect row | No | No |

A category with **Allow new threads** on lists its own threads under the
forums it contains. Turning it off again stops new ones; the threads
already there keep their addresses.

### Moving a forum

Drag a row by its handle: up and down to reorder, sideways to change how
deep it sits. Nothing is written until you let go.

Each row also carries four arrows: up, down, in, out. **In** nests the
row under the sibling directly above it; **out** lifts it to sit after
its own parent. They serve keyboards, screen readers and JavaScript-off
browsers, where each arrow is an ordinary form submission. An arrow with
nowhere to go is disabled rather than hidden.

Four rules the screen enforces:

- **A forum takes its subforums with it.** The whole subtree is re-hung
  in one write, keeping its internal order.
- **What lands somewhere new inherits from where it landed.** Moving a
  busy forum under a private category hides the whole subtree; the screen
  says so under the tree.
- **A link row holds nothing.** Nothing nests inside one, by drag or by
  arrow.
- **A forum cannot move into its own descendant**, and cannot land beside
  a sibling that already uses its slug. Both are refused with the reason.

Reordering under the same parent does not ask for your password again.
**Re-parenting does**, on the same fifteen-minute re-authentication rule
as everything else destructive in the panel, because it changes what the
subtree inherits.

Each forum's **Display order** on `/admin/forums/[id]` is the number the
tree screen writes. A move renumbers the new siblings densely from zero,
so the numbers never tie; typing one by hand still works.

### A forum's own options

`/admin/forums/[id]` carries everything about a forum except where it
sits: title, slug, description, link URL for a link row, and these
switches.

| Switch | What it decides |
|---|---|
| **Open for posting** | The forum accepts writes at all |
| **Allow new threads** | New threads may be started here |
| **Allow replies** | Existing threads may be replied to |
| **Allow polls** | A new thread may carry a poll |
| **Allow attachments** | Files may be attached to posts here |
| **Require a thread prefix** | A new thread must choose a prefix |
| **Hold new threads for approval** | New threads land unapproved |
| **Hold new replies for approval** | New replies land unapproved |

These are properties of the forum, and apply to every group at once. The
per-group version of the two approval switches is the three *requires
approval* rows in the matrix below.

## Permissions

There are **45 permission fields**: 26 resolved per member per forum, 19
board-wide. Every read path (pages, search, feeds, the REST API) asks the
same resolver.

### What decides a value

A forum permission is resolved per group and then combined, in that
order.

1. **Each of the member's groups is resolved on its own.** For one field,
   the board walks the forum's ancestor chain from the forum itself
   upwards and takes the first explicit value that group has anywhere on
   it. If the group has none, the group's own default is used.
2. **Those per-group answers are then combined**, by kind:
   - **Switches** are OR: granted if any group grants it.
   - **Numbers** take the most generous value, and `0` means unlimited,
     so a member in any group set to `0` is unlimited.
   - **The three *requires approval* rows** are AND: a member is exempt
     as soon as one of their groups does not require it.
3. **Moderator appointments** are separate, per forum, per member or
   group. See [what an appointment grants](#what-an-appointment-grants).

> [!IMPORTANT]
> **Deny is not board-wide.** Denying a cell for one group only removes
> that group's contribution. A member who is also in a group that grants
> the same thing still has it. To close a forum, deny it for every group
> that would otherwise grant it, including Guests.

> [!IMPORTANT]
> **Empty means inherit, and it is not the same as "no".** Each cell is a
> three-state control rather than a checkbox: a checkbox would write an
> explicit value into every cell on first save, pinning the forum so
> later changes at its parent do nothing.

### Reading the matrix

`/admin/forums/[id]/permissions` is one grid: **rows are permission
fields, columns are groups**, gathered under headings (viewing, posting,
own content, moderation, attachments, approvals). Each table scrolls
horizontally inside its own frame with the permission column pinned on
the left. The group-header row is not pinned.

Each switch cell is a three-way toggle: **Inherit**, **Grant**, **Deny**.
The three approval rows read **Required** and **Not required** instead. A
cell left on **Inherit** shows the value it currently resolves to, in
muted type beneath the toggle; that value moves if an ancestor forum's
cell changes later.

The three numeric fields (edit window, attachments per post, attachment
size) sit in their own section below, in the same shape. Each cell is a
number box that may be left blank for inherit, with the effective value
shown beneath a blank one.

**One save writes every cell that changed, across every group, in a
single transaction**, and logs one admin action per group that actually
changed. A group whose cells all match what was stored writes nothing
and is not logged. A cell left on Inherit round-trips as inherit; saving
never turns it into an explicit Deny.

**Copy to subforums** means *identical*, not *merged*: it writes the
source forum's stored overrides into every forum beneath it and clears
the ones the source does not have. The screen previews how many
settings, across how many forums, and how many are left unchanged, and
asks for your password again.

### The forum grants worth understanding

Most cells do what their name says. These do more.

#### A "your threads only" forum

Denying **see threads started by other users** (`canViewOthersThreads`)
turns a forum into a support desk: everybody may post, and nobody but a
thread's author reads it. Use it for applications, appeals, or anything
a member should write without the rest of the board reading it.

The deny holds on the thread list and on a thread reached by a guessed
URL alike. A refused thread is a 404, the same answer a thread that does
not exist gives.

- **A member** sees the forum and may post in it. In the listing they see
  only threads they started. On the board index the forum's counts read
  `0`, its last-post column is blank, and it never shows the unread mark,
  because all three describe other people's threads.
- **A guest** sees the forum and nothing in it. Grant the permission to
  the Guests group if the forum is meant to be publicly readable.
- **Anybody appointed to the forum** sees everything in it, whatever the
  cell says, as with *see unapproved* and *see deleted*.

> [!IMPORTANT]
> Denying this permission does **not** hide the forum. `canView` decides
> whether the forum exists for a viewer and `canViewThreads` whether its
> threads open at all; this one only decides *whose*. A forum meant to be
> invisible wants `canView` denied instead.

#### Letting members delete their own threads

`canDeleteOwnThreads` is the thread-sized twin of `canDeleteOwnPosts`.
Granted, the member who **started** a thread may delete it, which moves
the whole thread to `visibility=deleted`, the same reversible state a
moderator's delete produces. It is off by default.

- **It is per forum**, like every matrix cell, so it can be granted in a
  scratch forum and denied in the one that holds your rules.
- **It does not carry the undo.** Restoring a thread needs *Restore
  posts*, a moderator right: a member who deletes by accident has to ask.
- **It takes the replies with it.** One member can remove a conversation
  other people wrote in. Where that matters, leave it denied and let
  members delete their own *posts* instead.

#### Delete and restore, for a group

**`canSoftDeletePosts` granted in the matrix covers posts, both ways.** A
group with that cell may delete *and* restore anyone's post in that
forum; there is no second cell. It does not reach threads: deleting or
restoring a whole thread is a moderator right.

### What an appointment grants

`/admin/forums/[id]` appoints a member **or** a group to one forum, not
both, optionally cascading to everything beneath it. It offers **nine**
checkboxes:

| Checkbox | What it decides |
|---|---|
| Edit posts | `post.editOthers`: editing somebody else's post |
| Delete posts | `post.softDelete` and `thread.delete`: moving content to `visibility=deleted` |
| Restore posts | `post.restore` and `thread.restore`: putting deleted content back |
| Approve content | `content.approve`: releasing held content, and the approval queue |
| Open and close threads | `thread.lock` |
| Stick threads | `thread.stick` |
| Move threads | `thread.move`: in the source forum and the destination alike |
| Merge threads | `thread.merge` |
| Split threads | `thread.split` |

Appointing somebody who already moderates the forum replaces what they
may do rather than adding to it. Where a member is covered by several
appointments (their own, one their group holds, a cascading one from an
ancestor) the rights are unioned.

**Any appointment at all, even one carrying no checkbox, lets its holder
*see* held and deleted content in that forum.** Acting on it needs the
right that names the act. The screen labels an empty appointment *no
rights: can read the queue and nothing else*.

> [!IMPORTANT]
> **Delete and restore are two grants, not one.** Somebody appointed with
> *Delete posts* alone can remove a post and cannot put it back,
> including one they removed themselves. Tick *Restore posts* as well
> unless withholding the undo is what you meant.

> [!NOTE]
> **There is no hard delete.** Deleting a post or a thread always means
> `visibility=deleted`: the row stays, and somebody with *Restore posts*
> can undo it.

**"My forums" in the moderator control panel lists what somebody actually
holds**, per forum. *Open and close threads* shows there as **Lock and
unlock**, and *Stick threads* as **Pin and unpin**. If a right is not in
that list, the board will refuse the act.

### The doors no bypass opens

Two global permissions bypass the matrix:

- **`isSuperModerator`** passes every forum-scoped action.
- **`isAdministrator`** passes those and most board-wide ones as well.

Each use is written to the **server log** (the application log, not
`/admin/log`) as an `authorization bypass` line naming the kind, the
member, the action and the forum.

Three permissions sit outside the administrator bypass, and are checked
against the member's groups like anybody else's:

| Permission | What it gates |
|---|---|
| `canAccessAdminCp` | The admin control panel itself |
| `canWarnUsers` | Issuing and revoking warnings |
| `canUploadAvatar` | Uploading a custom avatar |

`canAccessAdminCp` is separate from `isAdministrator` so a trusted role
can be given the panel without the bypass, or the bypass without the
panel.

Two states come before permissions entirely: a **banned** member is
refused everything, and a member **awaiting activation** may only read
forums, threads, profiles, the member list and search.
