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
