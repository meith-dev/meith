# MyBB migration checks

Use the [import procedure](migrating.md), then review these areas before cutover:

| Area | Check |
|---|---|
| [Permissions](mybb-permissions.md) | Rebuild groups, forum access, appointments and warning rules |
| [Content](mybb-content.md) | Review Markdown conversion, polls and supported uploads |
| [Accounts](mybb-members.md) | Check profiles, messages, subscriptions and identity settings |
| [Discovery](mybb-discovery.md) | Test search, unread views, feeds and redirects |

Rehearse with ordinary and staff accounts, private forums, long threads, polls, attachments, signatures and messages. Compare against an untouched source copy.

Do not assume source permissions or presentation survive. Any group grant can override another group's denial. BBCode styling may be removed and unsupported tags may remain as text.
