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

The minimum form time uses a server-signed issuance timestamp, valid for 30 minutes. Missing, edited, expired or future timestamps are rejected while the timing check is enabled. A form left open longer must be refreshed. Setting the minimum to zero disables the timing check.

## Registration questions

Select **Ask a question** and add questions with accepted answers at `/admin/antispam`. Matching trims, ignores case and collapses repeated spaces. Question mode requires an enabled question before registration can succeed. Each issued question has a signed proof valid for 10 minutes. A successful answer consumes that proof once across all board instances; a later registration error requires refreshing the form. Replayed, expired or edited proofs are rejected. Verification failures do not bypass the challenge.

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

Flood intervals, hourly caps and [group daily allowances](groups.md) are independent. Upload limits cover avatars and attachments. PostgreSQL retains counters across instances. Hourly and API sliding limits charge only accepted requests; rejected requests do not increase the stored count or prolong its decay. Concurrent requests reserve their allowance atomically.

Review community-flagged posts in moderation. Check word-filter previews before saving. Ban patterns are globs, not regular expressions; registration filters do not retroactively ban accounts.

Word-filter replacements are literal text: HTML characters display as text, and
`$` replacement tokens have no special meaning. Filtering rendered posts and
search excerpts preserves tags, attributes and HTML entities. Titles, summaries
and other plain-text fields are filtered without adding HTML encoding.

For blocked registration, check registration policy, activation, question answers, filters and the displayed limit. For shared or incorrect client addresses, check [trusted proxies](../operations/web-security.md). For undelivered activation links, check [mail](../operations/mail.md).
