# Groups and promotions

Open **Admin → Groups**. Members have one primary group and can hold additional groups. Both contribute permissions.

## Set permissions and allowances

Any group can grant a permission. Numeric allowances use the highest value, with zero meaning unlimited. Approval is required only when every group requires it. [Forum overrides](forums.md) apply before groups combine.

| Setting | Limit |
|---|---|
| `maxPostsPerDay` | Thread starts and replies per UTC day |
| `maxPrivateMessagesPerDay` | Sends per UTC day; recipient count does not multiply it |
| `privateMessageQuota` | Stored messages |

Daily allowances are separate from flood intervals and hourly limits. Flood bypass does not remove daily allowances. Panel access and administrator authority are separate permissions.

## Set display identity

Set title, order, badge and light/dark name colours. The staff flag includes non-empty groups on `/staff`.

Members can select an ordinary display group under **Account → Profile**. **Maximum displayed groups** controls the number of titles shown; the leading group supplies colour and badge. Staff authority remains visibly identified.

## Allow plugin grants

Enable **may be granted by plugins** on ordinary groups a plugin may assign. Staff and other powerful groups cannot be grantable. Configure permissions before selecting the group in [Dues](membership-guide.md).

## Configure promotions

Create activity, tenure or reputation rules under **Promotions**. Check whether the rule changes the primary group or adds membership. Review the eligible-member preview before applying it.

The preview stops at 50,000 members and reports truncation. Enabled rules run hourly in batches of 10,000, retaining their position between runs. Manual application does not change the schedule.

## Remove a group

Check memberships, paid plans and plugin grants first. Keep a valid primary group for each account. After changing roles or deleting a group, test staff and private-forum access.
