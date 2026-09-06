# Set up your community

Use this checklist after completing `/install`. You need the administrator
account created by the installer. If the board is not installed yet,
[choose a deployment](./deployment/index.md) first.

## 1. Open the admin panel

Sign in to the board, then open `/admin`. Enter your password again to open
the admin panel's separate session. On a small screen, use the panel menu
to reach its sections.

## 2. Check the name, appearance, and rules

- **Admin → Board settings → Board**: set the board name and description.
- **Admin → Themes**: upload a logo and choose the default theme. You can
  adjust its colours and fonts without deploying new code.
- **Admin → Board settings → Legal**: publish your community's Rules & FAQ,
  terms of service, and privacy policy. Non-empty pages appear in the footer.

[Community administration](../guides/community/organiser-guide.md#making-the-board-look-like-yours)
explains the appearance controls.

## 3. Test mail before opening registration

Open `/admin/settings?group=mail`, save the sending settings, and select
**Send a test message to me**. Check that it arrives.

Under `/admin/settings?group=registration`, choose whether registrations are
open and whether accounts need email confirmation, administrator approval,
both, or neither. Email confirmation and password reset need working mail.
If delivery fails, follow [Mail](../guides/operations/operating.md#mail).

## 4. Create the forums

The installer creates a first forum. At **Admin → Forums**, rename it or
add categories and forums for your community. Keep the initial list small
enough that new members can find where to post.

For a private staff forum, create the staff group, assign its members, then
set the forum's permissions. Follow the
[private forum procedure](../guides/community/organiser-guide.md#a-private-forum-for-the-organisers):
a deny applies to one group's contribution, and another group can still grant access.

## 5. Assign moderators

Open each forum in **Admin → Forums** and appoint its moderators. Choose
the actions they need; deleting and restoring posts are separate permissions.
Give moderators the [Moderation guide](../guides/community/moderation-guide.md).

## 6. Check the member experience

Create an ordinary member account and check the board with it, then sign out
and check as a guest. An administrator can bypass forum restrictions, so an
administrator account alone cannot prove a private forum is private.

Check that:

- Guests and ordinary members see only the intended forums.
- A member can create a thread and reply where permitted.
- Registration and password reset messages arrive.
- The rules and navigation links lead to the right pages.

Post a welcome thread with the community's purpose and a link to its rules.
The [Member guide](../guides/community/member-guide.md) covers the common tasks.

## 7. Confirm the handover

Ask the operator to confirm that scheduled work is running, an off-site
backup has completed, and a restore has been tested. Use
[Monitoring](../guides/operations/monitoring.md),
[Backups](../guides/operations/backups.md), and
[Disaster recovery](../guides/operations/disaster-recovery.md) for those checks.

For ongoing administration, continue with
[Community administration](../guides/community/organiser-guide.md).
