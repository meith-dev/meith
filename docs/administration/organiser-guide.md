# Community administration

Use the admin panel to manage the people, content and settings of an installed board. Sign in to your community and open `/admin`; the panel asks for your password again because it has a separate session.

For a new board, complete [Set up your community](first-steps.md) first. You do not need to edit source code for the tasks on this page.

## Find a task

| Task | Guide |
|---|---|
| Create forums or make a staff area private | [Forums and permissions](forums.md) |
| Give groups permissions or set promotion rules | [Groups and promotions](groups.md) |
| Open registration or change a member's role | [Manage members](manage-members.md) |
| Change the name, logo, colors or theme | [Board appearance](appearance.md) |
| Publish announcements or change navigation | [Community communications](community-communications.md) |
| Review posts, reports, warnings or bans | [Moderation](moderation-guide.md) |
| Stop spam or diagnose blocked registration | [Spam controls](antispam.md) |
| Set search language and limits | [Search settings](search.md) |
| Configure ratings and thanks | [Reputation](reputation.md) |
| Run events | [Calendar](calendar.md) |
| Recognize members | [Awards](awards-guide.md) |
| Offer paid membership | [Dues](membership-guide.md) |

Calendar, Awards and Dues require their respective plugins. The operator installs plugin packages; the admin panel controls the installed features.

## Check permissions as a member

Administrators can bypass many forum restrictions. After changing groups or forum permissions, verify the result with an ordinary member account and while signed out. A forum that looks correct to an administrator may still expose content to the wrong audience.

Appoint moderators through each forum's administration page. Give only the required actions and ask the moderator to check **My forums** at `/modcp/forums`.

## Publish community rules

Under **Board settings → Legal**, maintain the Rules & FAQ, terms and privacy pages. Non-empty pages appear in the footer. Check the published pages while signed out, and make sure the registration and contact instructions match how your community operates.

## Work with the operator

Ask the operator for deployment changes, email delivery problems, missing extensions, storage, backups and upgrades. Use [Server operations](../operations/operating.md) for the technical handover. If you manage both roles, keep deployment changes separate from ordinary panel settings so you know what requires a redeploy.
