# Accounts and messages after import

## Notifications

Notifications are stored on the board even when email is disabled. The header combines unread notifications, messages and relevant moderation work; without JavaScript it provides count links.

Repeated events with the same dedupe key coalesce while unread; after reading, a new event creates a new row. Report outcomes notify the reporter without disclosing moderator notes.

Instant subscription delivery runs on the next scheduled task. Daily/weekly cadence is per member and cadence. Auto-follow for started/replied threads is separately configurable, off by default, and never overwrites an existing mute. Composer choices provide a per-post override.

Board activity digests are separate, opt-in weekly/monthly mail for absent members. Content follows recipient permissions. Announcement consent is not imported from MyBB's opt-out field.

Unsubscribe URLs open a confirmation page; POST applies the change. Digest unsubscribe disables the relevant email channel without deleting the follow list; a per-thread instant unsubscribe ends that subscription. See [Notifications](../members/notifications.md).

## Accounts and profiles

| Area | Meith behaviour |
|---|---|
| Timezone | IANA name; imported offsets map to representative zones and need review |
| Automatic timezone | Browser detection; explicit member choice wins; no-JavaScript fallback is UTC |
| Password change | Revokes other sessions and replaces the current one |
| Email change | Requires current password and confirmation at the new address |
| Reset/confirmation | Public response does not reveal account existence or delivery outcome |
| Activation | `users.state` and `email_verified_at`, independent of group membership |
| Username length | Unicode code points, consistently across installations |

Custom profile values do not import. Recreate fields and access rules. Per-group field values can grant, deny or abstain; any grant wins. Registration asks only required fields the default member group can edit. Clearing an answer deletes its value row. `profile-field:add` starts fields editable by all groups; restrict them as needed.

## Private messages

Content is stored once with participant copies. Storage quota counts copies; daily allowance counts sends. Both combine as most-generous numeric permissions, with zero unlimited.

If any recipient is full, the whole send fails and identifies full recipients. Recipient blocking uses the same refusal as other messaging restrictions and does not disclose ignore status.

Reply addresses the author only; there is no reply-all. Deleting your copy does not delete another participant's. Unreferenced content rows are not automatically pruned.

### Staff access

The application exposes no staff inbox browser or search. A participant's report permits review of that message only. Additional context requires reporting additional messages. Database access remains outside this application-level boundary.

## Contacts and signatures

Ignoring withholds post bodies server-side but preserves numbered placeholders with reveal links. Buddy/ignore relations are directional and mutually exclusive per ordered pair.

Signatures support emphasis, strong, strikethrough, inline code and links. Images and block constructs display as text. A staff lock retains the signature and reason, hides it publicly and prevents editing; unlocking is manual, without timed expiry. Avatars use the same lock approach.

## Reputation

New ratings are −1, 0 or +1 without group power multipliers. Groups control eligibility and daily allowance. Reputation and warning totals are recomputed from current rows on relevant changes, including merges. Review imported ratings and [reputation settings](../administration/reputation.md).
