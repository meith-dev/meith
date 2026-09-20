# Forums and permissions

Open **Admin → Forums** (`/admin/forums`).

## Create a forum

Select **Add forum**, choose a type, enter its title and slug, then save.

| Type | Content |
|---|---|
| Category | Forums; threads when **Allow new threads** is enabled |
| Forum | Threads and optional subforums |
| Link | Redirect URL; no children |

Arrange rows with drag handles or the up/down/in/out buttons. Moving a forum moves its descendants and changes inherited permissions. Re-parenting requires password confirmation. A forum cannot be its own descendant, sit inside a link or share a sibling's slug.

**Open for posting**, **Allow new threads** and **Allow replies** are separate switches. Group grants cannot override a closed forum. Set prefixes, polls, attachments and approval requirements on the forum page.

## Set permissions

Open **Permissions**, edit the group columns and save. Each group uses the nearest explicit forum or ancestor value, then its group default. Multiple groups combine as follows:

| Kind | Result |
|---|---|
| Permission | Any grant allows the action |
| Numeric allowance | Highest value wins; 0 is unlimited |
| Approval requirement | Required only if every group requires it |

**Inherit** is unset, not denied. A blank numeric field inherits; zero is unlimited. Denying one group cannot cancel another group's grant.

**Copy to subforums** replaces descendant overrides, including clearing values the source inherits. Review the preview before confirming your password.

## Make a private forum

1. Create the intended group and assign members.
2. Create the forum.
3. Deny viewing to Guests and every ordinary group that otherwise grants it.
4. Grant the intended access to the private group.
5. Test with guest, ordinary and authorised accounts.

For an own-thread-only support forum, allow entry and posting but restrict **see threads started by other users** (`canViewOthersThreads`).

## Appoint moderators

Appoint a member or group in the forum's moderator controls. Approval, editing, deletion, restoration, locking, pinning, moving, merging and splitting are separate grants. Check any cascade to subforums.

Moderators can inspect their appointments at `/modcp/forums`. See [Moderation](moderation-guide.md).

## Diagnose access

Check all group memberships, ancestor overrides, forum switches and moderator appointments. Test with ordinary accounts; administrators can bypass restrictions. See [Groups](groups.md) and [Imported permissions](../operations/mybb-permissions.md).
