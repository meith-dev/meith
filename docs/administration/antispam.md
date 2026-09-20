# Spam controls

Open **Board settings → Antispam**. Test changes with an ordinary account.

| Control | Use |
|---|---|
| Hidden-field trap | Reject automated registration; on by default |
| Minimum form time | Reject fast registration; default 3 seconds |
| Registration question | Require an accepted answer |
| Hold first posts | Review new-member content |
| Hourly limits | Limit posts, messages, searches, reports and uploads |
| Community flag threshold | Hold posts reported by enough distinct members |
| Word and ban filters | Filter content or registration identities |

## Registration questions

Select **Ask a question** and add questions with accepted answers at `/admin/antispam`. Matching trims, ignores case and collapses repeated spaces. An empty question set does not protect registration.

## Registration and reset limits

| Key | Default | Scope |
|---|---|---|
| `antispam.register_ip_per_hour` | 10/hour | Address range |
| `antispam.reset_per_hour` | 5/hour | Target email |
| `antispam.reset_ip_per_hour` | 20/hour | Requesting address range |
| `antispam.login_ip_attempts` | 100/window | Address range |

Address ranges are IPv4 /24 or IPv6 /48. Shared networks share allowances. Zero disables a limit. Password reset returns the same public response for unknown accounts and limited requests.

## Sign-in lockouts

Failures count per account/address, per account across addresses and per address across accounts. Defaults are 5, 50 and 100 within `security.lockout_minutes` (15 minutes). Account limits are under Security; address limits are under Antispam. Success clears the account-specific buckets, not the shared address bucket.

## Posting and filters

Flood intervals, hourly caps and [group daily allowances](groups.md) are independent. Upload limits cover avatars and attachments. PostgreSQL retains counters across instances.

Review community-flagged posts in moderation. Check word-filter previews before saving. Ban patterns are globs, not regular expressions; registration filters do not retroactively ban accounts.

For blocked registration, check registration policy, activation, question answers, filters and the displayed limit. For shared or incorrect client addresses, check [trusted proxies](../operations/web-security.md). For undelivered activation links, check [mail](../operations/mail.md).
