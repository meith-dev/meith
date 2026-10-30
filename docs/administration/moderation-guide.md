# Moderation

Open `/modcp`. Check `/modcp/forums` for your assigned forums and allowed actions.

| Page | Task |
|---|---|
| `/moderation` | Approve or reject held threads and posts |
| `/moderation/reports` | Handle member reports |
| `/modcp/log` | Review moderation actions |
| `/modcp/ip` | Address lookup; administrators and super-moderators only |

## Review content and reports

Read queued items, select them and choose **Approve selected** or **Reject selected**. New-member controls, forum rules and warnings can hold content. A moderate-posting warning also applies to staff.

An opening post held after an edit appears as a post in the approval queue while
the thread remains published. It can be approved or rejected like a held reply.
An entirely held thread appears once as a thread, including its opening post.

Open a report, review the item, record the outcome and close it. Private-message reports expose the reported item, not general inbox access. Review community-flagged content before restoring or removing it.

## Manage threads

Use **Moderator tools** or list selection controls to edit, lock, pin, move, split, merge, delete or restore content. Each action requires its own permission. Delete permission does not include restore permission.

Before moving or merging, check the destination audience and required permissions. A merge retains the selected target thread and deletes the source thread’s poll, votes, ratings, subscriptions and read markers. Back up before a merge if those must be recoverable. A split creates a new thread from selected posts.

Attachments follow posts into the destination forum during moves and merges,
including its download permissions. Deleting the former forum does not delete
those attachments. Migration `0070_attachment_forums` repairs attachment forum IDs
left behind by earlier moves; downloads always check the thread's current forum.

## Warnings and bans

Warnings add points and may expire or be revoked. Warning levels can restrict posting, require approval or impose a ban. Check the effect before applying a warning.

Warnings cannot target staff of equal or greater authority. Administrators and
members with AdminCP access outrank super-moderators, who outrank other staff and
appointed forum moderators. Active secondary memberships count toward this
protection. Administrators cannot warn other administrators.

Points are not percentages. Revoking them does not necessarily undo an imposed ban. Ban expiry needs scheduled work.

An unlifted ban determines the actor's banned state, including bans created before
this enforcement was added. Secondary groups grant no permissions while banned;
their memberships and the account's activation state are preserved for lifting.
Creating a ban revokes forum, remember-me and administrator sessions, API and feed
tokens, outstanding credential links and push subscriptions in the same transaction.
Creating, lifting or expiring bans invalidates cached permissions. Lifting a ban
does not restore revoked credentials or registered push devices.

After an action, check content visibility, member restrictions and the log. Ask an administrator to adjust [appointments](forums.md) when required actions are unavailable.
