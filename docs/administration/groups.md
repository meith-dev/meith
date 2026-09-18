# Manage groups and promotions

Groups grant permissions, set allowances and control member identity. Manage them at **Admin → Groups**. Use forum-specific overrides in [Forums and permissions](forums.md).

## Create or edit a group

Open a group to set its title, permissions and limits. A member has a primary group and may hold additional groups. Review the combined permissions before adding a powerful group to an account.

| Setting kind | How multiple groups combine |
|---|---|
| Permission switch | Any group can grant it |
| Numeric allowance | Most generous value wins; 0 means unlimited |
| Approval requirement | A group that does not require approval can exempt the member |

Panel access and administrator authority are distinct permissions. Give only the role the member needs, then verify it with the member's account.

## Set posting and message allowances

`maxPostsPerDay` limits thread starts and replies together. `maxPrivateMessagesPerDay` limits sends; one send counts once regardless of the number of recipients. Both use UTC days, and zero means unlimited.

These daily allowances are separate from flood intervals and hourly spam controls. Bypassing flood checks does not remove a group's daily allowance.

`privateMessageQuota` controls stored messages, not the daily send rate. Increasing a send allowance does not free a full inbox.

## Configure group identity

Choose a title, display order, badge and optional name colors. Check light and dark variants; a color that works on one background may not work on the other. The staff-group flag determines which groups appear on `/staff`.

Members with a choice of ordinary groups can select a display group under **Account → Profile**. The board's **Maximum displayed groups** setting controls how many group titles appear. The leading group supplies the main name color and badge.

Staff and groups carrying administrative or moderation authority remain visibly identified as staff. A purchased or selected display group must not hide that responsibility.

## Let a plugin grant a group

Enable **may be granted by plugins** only on groups intended for plugin-managed membership. Staff and power-carrying groups cannot be made grantable this way.

A paid membership can grant access, a badge or other ordinary group benefits. Configure the group's permissions first, then select it in the plugin. Read [Dues](membership-guide.md) for paid memberships.

## Configure promotions

Use the Promotions page to create rules that move eligible members into a group based on the supported activity, tenure and reputation criteria. Check whether the rule changes primary membership or adds membership, then test it on a representative account.

Promotions depend on scheduled work. If a qualifying account does not change, inspect the rule, member values and scheduler status rather than repeatedly adding the group manually.

## Move members or remove a group

Review memberships and affected permissions before moving accounts. Ensure members retain a valid primary group and that no paid plan or plugin grant still relies on a group you intend to remove. Follow the panel's validation and confirmation messages.

After any structural change, check private forums and staff access using ordinary accounts.
