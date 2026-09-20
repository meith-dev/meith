# Members and registration

## Configure registration

Open `/admin/settings?group=registration`.

| Setting | Effect |
|---|---|
| **Allow new registrations** off | Hides registration; existing accounts can still sign in |
| **Activation method** | None, email confirmation, administrator approval or both |

Test [mail delivery](../operations/mail.md) before requiring confirmation. Configure questions and limits under [Spam controls](antispam.md).

Announcement email requires separate opt-in during registration or at **Notifications → Preferences**. It starts unchecked.

## Manage accounts

Find the account under **Admin → Users** to change activation state, primary group or additional memberships.

The user list supports up to 500 selected accounts for a shared-reason ban, additional-group assignment or prune review. Prune review rechecks that accounts have no content, ban or staff role and requires fresh authentication before closure.

Reversible actions show **Undo** for ten minutes. Only the initiating administrator can use it, once. Pruning, merging and credential deletion require confirmation and cannot be undone this way.

## Assign and remove staff

Assign [groups](groups.md) for board-wide roles. For forum-specific moderation, appoint the member under **Admin → Forums** and select individual actions.

When staff leave, remove their privileged memberships and forum appointments. Keep their personal account and posts. Use separate accounts for each administrator and retain more than one administrator for recovery.

## Configure onboarding

Members without posts see dismissible welcome, profile and composer prompts. Dismissals are stored per browser; posting ends the prompts. Set **Rules & FAQ** at `/admin/settings?group=legal` to add its composer and footer links. Empty legal pages remain unpublished.

## Operator tasks

Ask the operator to handle [backups](../operations/backups.md), [upgrades](../operations/upgrading.md), [mail](../operations/mail.md), [extension installation](../operations/installing.md) and [account recovery](../operations/operator-cli.md#account-recovery).

Marketplace update notices identify available versions; they do not install packages.
