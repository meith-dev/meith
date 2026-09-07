# Community awards

Use Awards to recognise helpful members, celebrate contributions and show
achievements beside posts. The operator installs `@meith/plugin-awards`
and applies its migrations; see [Installing plugins and themes](../../customization/installing.md).
Administrators manage awards under **Admin → Plugins → Awards**.

## Create an award

Open **Awards**, enter a name and description, and choose an icon. Use one
emoji, a built-in name (trophy, medal, star, shield, crown, heart, flame,
gem, ribbon, rocket, book or handshake), a same-origin image path, or an
HTTPS image URL. There are no icon uploads. Remote image icons need the
board's remote-images setting because the default CSP is `img-src 'self' data:`.

**Display order** sorts smaller numbers first; edit that number to reorder.
**Allow multiple grants per member** permits repeated recognition. Leave it
off for a single achievement. Simultaneous single-only assignments are
serialised before the conditional insert. Changing a multiple award to
single-only is refused while any member holds duplicates; revoke those first.

**Listed in the catalogue** controls discovery on `/plugins/awards`.
Unlisted awards still appear on holders' profiles and can be visited directly;
this is not a privacy setting. **Archive** hides an award everywhere publicly
and prevents new grants while keeping its history. **Unarchive** restores it.
**Delete** works only when there are no grants; otherwise use Archive.

## Give or revoke recognition

Open **Grant awards**, choose an award, enter one or more usernames separated
by commas, and add an optional reason. Unknown names stop the whole request
before any assignments. Already-held single awards are skipped, with a notice
if only some recipients received the award. Each successful grant sends an
award notification unless **Notify members when they receive an award** is off.
Members control email and push delivery in their own notification preferences.

The recent grants table shows the latest 50 assignments. Filter it by username
and use **Revoke** to remove an individual grant. Manual grants can be made
again after revocation. Grant writes and notifications use separate host APIs;
a notification failure after a saved grant does not undo the recognition.

## What members see

The **Awards** navigation item opens the public catalogue: name, icon,
description, holder count and how each award is earned. An award's page lists
50 holders per page. Each member has `/plugins/awards/member?id=N`, linked
from their award icons, and a profile panel with counts and every grant date.
Dates use the reader's locale and UTC.

**Maximum awards beside each post** defaults to 5; 0 hides them and the
maximum is 100. A **+N** link counts additional distinct awards. The postbit
uses one indexed, grouped query behind a 60-second cache of at most 2,000
authors per process, shared across separately bundled routes. Local grants,
revocations and award edits invalidate it;
other processes can show the previous state for up to a minute.

**Show manual grant reasons publicly** defaults to on. Turn it off to keep
reasons in administration. The dashboard reports grants in the last seven days.
Deleting a member removes their grants and queued work. Merging accounts moves
grants to the kept account and collapses single-only and same-rule duplicates.

## Version-one limits

There are no repeating tiers, categories, icon uploads, or automatic revocation
when criteria stop holding. Awards confer recognition, never permissions or
group membership. Plugin tables contain only award data and plain member ids;
member lookup exposes public names and standing, not private account data.

## Automatic achievements

Open **Rules** to create a rule for an award. Enter a title and any combination
of minimum posts, threads, reputation and days registered. Every configured
threshold must hold. Blank means ignored; at least one is required, and zero
explicitly allows every member for that criterion. Whole days are elapsed
24-hour periods from registration. Enable or disable rules, edit them through
their title links, or delete a rule without removing awards already granted.

Each rule grants once per member while its grant exists, even if the award
allows multiple grants. Separate rules can grant the same multiple award.
Single-only awards still refuse a second grant, whether manual or automatic.
Revoke removes the grant: an enabled rule may award it again on re-evaluation
if its criteria still hold. Disable that rule first to stop further automatic
grants. Lowering counts or raising thresholds never revokes an existing award.
The public catalogue explains enabled rules instead of saying “Given by staff”.

The `evaluate` task runs every 300 seconds. Post and thread creation, reputation
changes, registration and activation queue the affected member with one insert.
Each run drains up to 500 queued members in batches of at most 200, then walks
up to 1,000 members by ascending id. This full scan catches tenure thresholds
and contributions made before installation. **Run now** performs the same
bounded batch synchronously; **Re-check everyone** resets the scan cursor.
The rules screen shows the cursor and the last completed pass. Large boards
need several runs to complete a pass; an exact batch boundary is recognised
as the end when the next scan is empty.

Queued batches are claimed before lookup and requeued on failure. Scan progress
is saved only after evaluating its batch, and a concurrent run cannot overwrite
a cursor it did not read. Repeated evaluation does not duplicate a rule's grant
or send another notification. Newly granted awards use the same cache invalidation
and notification path as manual assignments. Rules use only the public member
standing API; no plugin query reaches the board's account or content tables.
