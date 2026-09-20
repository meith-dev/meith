# phpBB migration checks

Follow [Import](migrating.md). The MySQL/MariaDB importer does not reproduce phpBB ACLs or extensions.

| Area | Result and required action |
|---|---|
| Accounts | Re-promote staff and rebuild groups, ACLs and appointments; source roles and allow/deny/never rules do not transfer |
| Formatting | BBCode UID markers and stored smiley/link wrappers are cleaned before Markdown conversion; review custom tags and lost styling |
| Announcements | Stickies and forum/global announcements become sticky threads; recreate board banners separately |
| Moved topics | Shadow rows are skipped; test legacy redirects |
| Polls | Choice count and vote-change flag transfer; verify significant polls |
| Warnings | Source lacks points, titles and expiry; review imported effects and escalation |
| Bans | User bans transfer; email/IP bans and exclusions require separate configuration |
| Messages | Shared content with participant copies; PM attachments do not transfer |
| Avatars | Uploaded/gallery supported; remote URLs skipped |
| Contacts | Friends/foes become buddy/ignore relations |
| History | No reputation, historical moderator log or member IP history imported |

Test private forums as guests and ordinary members, not only administrators. Verify files and converted posts before opening the destination. See [Content conversion](mybb-content.md) and [Administration](../administration/organiser-guide.md).
