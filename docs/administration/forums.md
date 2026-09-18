# Create forums and control access

Create and arrange forums at **Admin → Forums** (`/admin/forums`). You need administrator access. After changing access, test with a normal member account and while signed out.

## Create and arrange forums

Use **Add forum**, choose its type, enter a title and slug, and save.

| Type | Purpose |
|---|---|
| Category | Groups related forums; can also hold threads when Allow new threads is enabled |
| Forum | Holds threads and optional subforums |
| Link | Sends the reader to another URL; cannot contain children |

Use drag handles or the up/down/in/out buttons to arrange the tree. The buttons also work without JavaScript. Moving a forum moves its descendants and changes the permissions they inherit from their parent. Re-parenting requires password confirmation.

A forum cannot become its own descendant, move inside a link row, or share a slug with a sibling.

## Configure posting

Open a forum to change its description, posting switches, thread prefixes, polls, attachments and approval requirements. **Open for posting**, **Allow new threads** and **Allow replies** are separate controls.

These forum options apply alongside member permissions. Granting a group permission does not make a closed forum accept posts.

## Understand permission inheritance

Open the forum's **Permissions** tab. Rows are permissions and columns are groups.

For each group, the nearest explicit value on the forum or its ancestors wins; otherwise the group's default applies. The resulting group values are then combined:

| Permission kind | Combination |
|---|---|
| Grant/deny switches | A grant from any group permits the action |
| Numeric allowances | The most generous value wins; 0 means unlimited |
| Requires approval | Approval is required only when all the member's groups require it |

**Inherit** leaves a value unset; it is not a denial. A blank numeric field inherits, while an explicit zero means unlimited. The matrix shows the effective inherited value beneath an unset control.

> [!IMPORTANT]
> Denying a permission to one group does not cancel a grant from another. Review every group held by the member.

Save the matrix after editing. **Copy to subforums** replaces descendant overrides with the source's stored overrides, including clearing values the source inherits. Review its preview and confirm your password before applying it.

## Create a private staff forum

1. Create a staff group and assign the intended members.
2. Create the forum in its intended position in the tree.
3. In Permissions, deny viewing for Guests and every ordinary group that would otherwise grant it.
4. Grant viewing and the intended posting rights to the staff group.
5. Save, then check as a guest, an ordinary member and a staff member.

An administrator account alone cannot prove the forum is private. Search, feeds and API reads use the same visibility rules, but verify the resulting audience through the ordinary member experience.

For a support forum where members should read only their own threads, review **see threads started by other users** (`canViewOthersThreads`). Grant enough access to enter the forum and create threads, while denying that additional visibility where appropriate.

## Appoint moderators

Open the forum's moderator controls and appoint a member or group with only the required actions. Approval, editing, deletion, restoration, locking, pinning, moving, merging and splitting are separate capabilities.

Ask moderators to check **My forums** at `/modcp/forums`. Appointments do not automatically grant every board-wide administrative capability. The [moderation guide](moderation-guide.md) explains the work they can perform.

## Verify changes

Check viewing, a new thread, a reply and any restricted action using representative accounts. If access is unexpected, inspect all groups, ancestor overrides, the forum's own options and moderator appointments before adding another override.

[Groups and promotions](groups.md) covers board-wide permissions and allowances. [Migration permissions](../operations/mybb-permissions.md) explains differences to check when importing a legacy board.
