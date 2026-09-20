# Permissions and moderation after import

## Permissions and groups

Rebuild source permissions before opening the board. Meith resolves the nearest forum override per group, then combines groups: any grant wins, numeric allowances use the maximum with zero unlimited, and approval requires every group to require it.

Flood intervals are board settings (`posting.flood_seconds`, `search.flood_seconds`), with `canBypassFloodCheck` as an exemption. There are no per-group intervals.

`canAccessAdminCp` grants panel access; `isAdministrator` grants the permission bypass. They are separate. TypeScript permission names are camelCase; schema columns are snake_case.

## Reports and thread tools

Post/thread reports follow forum moderator scope. Member and private-message reports require board staff access. Only message participants can report a message; staff review only the reported item.

Lock, pin, move, merge and split rights come from forum appointments or staff bypasses. Appoint a group to each required forum for group-wide moderation.

| Operation | Behaviour |
|---|---|
| Split | Selected posts form a thread in the same forum; move it separately if needed |
| Merge | The displayed thread is removed; its posts enter the specified target |
| Copy | Copies visible posts and increments attributed-author counts; requires `thread.move` at source and destination |
| Move | Retains thread ID; creates no source redirect stub |
| Delete/restore | Separate grants |

> [!CAUTION]
> Merging transfers posts only. The source thread's poll and votes, ratings, subscriptions and read markers are deleted. Check **Merge into thread #** before confirming.

Merge/split do not change author post counts; they change thread counts. Copy creates new counted rows and may target the same forum.

Inline moderation accepts up to 500 items in transactions of 25. Approval queues refuse more than 200. State guards permit retry after partial completion. Inline tools do not offer unapprove; community flag thresholds can still hold published posts for review.

## Warnings

Warnings use absolute points, with seeded levels at 4, 7 and 10. Posting restrictions apply after staff approval bypass. Revoking a warning lowers points but does not automatically lift an imposed ban; inspect and manage the ban separately.

## Logs and address lookup

Moderator and administrator actions share `admin_log`; the moderator view exposes an action allowlist and forum-scoped records. Database changes and their log entries commit together. Members editing their own posts and report-claim changes are not moderation log entries.

Current records use `forumIds`, with named source/destination fields for cross-forum actions. Older ambiguous move/merge/split records are limited to their author. The log has no automatic retention policy.

Address lookup uses retained prefixes, not full addresses. Registration and last-successful-sign-in prefixes are recorded; ordinary page views do not update them. Imported accounts have no source IP history. Matching a range is not proof of shared identity.

## Admin sessions

Panel sessions require reauthentication and have a 30-minute idle timeout and 8-hour maximum. Destructive actions require proof within 15 minutes; browsing does not refresh that proof. Password changes revoke panel sessions.

`ADMIN_IP_ALLOWLIST` accepts comma-separated addresses or textual prefixes ending in `.` or `:`, not CIDR. Empty means unrestricted. The check runs before session lookup and refuses requests without a usable trusted client address. Configure [proxy trust](web-security.md) before enabling it.
