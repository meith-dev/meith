# Announcements, navigation and email

## Announcements

At **Admin → Content → Announcements**, enter a title, Markdown body, UTC start, optional end and target forum or whole board. A blank end never expires. Forum announcements follow forum visibility. Announcements cannot receive replies.

## Navigation

At **Admin → Content → Navigation**, add, rename, reorder, hide or delete links. **Shown in the menu** controls visibility. Links may target board pages or external URLs.

Choose everyone, guests, members or staff, then optionally restrict by group. Drag items to create one level of submenus.

New boards show Home, New posts and Search. Unanswered, My posts, Who's online, Members and Staff start hidden.

## Member and staff lists

`/members` requires **Browse the member list**. Remove this permission from Guests to require sign-in. Members can search by name and sort by name, posts or arrival date.

`/staff` lists occupied staff-flagged groups in display order, including primary and active additional memberships.

## Mass mail

1. Open **Admin → Users → Mass mail** (`/admin/users/mail`).
2. Choose all eligible members or a group; check the displayed audience count.
3. Compose and queue the message.

Recipients must be active, open accounts with verified email and announcement consent. Registration alone does not enrol them. Unsubscribing excludes a member from subsequent delivery, including a campaign already running.

Mass mail needs working [mail](../operations/mail.md) and [scheduled tasks](../operations/scheduled-tasks.md). Use an announcement or thread for information all visitors must see.

## Board activity digest

Members opt in to weekly or monthly digests under **Notifications → Preferences**. A digest is due only after both the selected cadence and the configured absence period. Set **Board digest: days away before a member counts as lapsed** under Board settings; default 7 days.

Digests list busy threads since the member's last visit, filtered by their permissions. Digest unsubscribe links disable only this digest.

## Maintenance mode

Enable **Board offline** at `/admin/settings?group=board` and enter the message to display. Sign-in and the admin panel remain accessible so an administrator can reopen the board.
