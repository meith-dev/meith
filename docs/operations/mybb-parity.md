# MyBB migration differences

Read these differences before importing a MyBB community. The importer transfers supported data; it does not reproduce every MyBB permission, display rule or extension.

## Review the migration impact

| Area | What to review before cutover |
|---|---|
| [Permissions and moderation](mybb-permissions.md) | Group combinations, forum access, moderator appointments, warnings and audit logs |
| [Posts and uploads](mybb-content.md) | BBCode conversion, lost styling, poll rules, editing, avatars and attachment handling |
| [Accounts and messages](mybb-members.md) | Account state, profiles, private-message storage, notifications, ignoring and reputation |
| [Search and discovery](mybb-discovery.md) | Visibility, new-post listings, search behavior, feeds, URLs and spam controls |

## Rehearse with representative content

Import into an isolated destination. Check ordinary and staff accounts, private forums, a long thread, a poll, attachments, signatures and private messages. Compare converted content with the untouched source export.

Pay particular attention to permission combinations: denying one group does not cancel a grant from another. Test as guests and ordinary members, not only as an administrator.

Markdown replaces BBCode. Some styling is lost and unsupported tags may remain visible as text. Review the detailed [content conversion differences](mybb-content.md) before promising identical rendering.

## Perform the move

Follow [Import MyBB or phpBB](migrating.md) for credentials, row budgets, resumability, attachments and cutover. Keep the old board and its uploads available until you have verified the new one and its backups.

After import, use [Community administration](../administration/organiser-guide.md) for normal Meith operations. The comparisons are migration references, not the starting point for learning the product.
