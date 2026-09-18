# Configure spam controls

Start under **Board settings → Antispam**. Registration questions and content filters also have their own admin screens. Use a normal account to test a change before applying strict limits to the community.

## Choose a control for the problem

| Problem | Control |
|---|---|
| Bots fill every field | Hidden-field trap, enabled by default |
| Instant form submissions | Minimum fill time, default 3 seconds |
| Scripted registration | Question challenge |
| Spam from new accounts | Hold the first posts for approval |
| Excessive posting, messaging or uploads | Hourly limits and group daily allowances |
| Repeated community-reported content | Community flag threshold |
| Prohibited words or patterns | Word filter |
| Repeated unwanted registration identities | Ban filters |

A short minimum fill time can also catch an autofilled legitimate form. Change one control at a time and inspect the result.

## Configure registration questions

Choose **Ask a question** as the registration challenge and maintain usable questions under `/admin/antispam`. Provide accepted answers. Matching trims text, ignores case and collapses repeated spaces.

Questions deter generic scripts, not determined people. A challenge with no usable questions does not protect registration; the admin screen warns about it. Meith does not require a hosted CAPTCHA provider.

## Understand the pre-sign-in limits

| Setting | Default | Scope |
|---|---|---|
| `antispam.register_ip_per_hour` | 10/hour | Requesting address range |
| `antispam.reset_per_hour` | 5/hour | Target email address |
| `antispam.reset_ip_per_hour` | 20/hour | Requesting address range |
| `antispam.login_ip_attempts` | 100/window | Requesting address range |

Address limits use IPv4 /24 or IPv6 /48 ranges. Members at a school, office or event can share a range, so account for legitimate shared access. Zero disables the corresponding limit.

The password-reset form gives the same public response whether or not an account exists or a limit prevented sending. This avoids revealing account membership.

## Review sign-in lockouts

Failed sign-in counts against three buckets: account plus address, account across addresses, and address across accounts. Defaults are 5, 50 and 100 attempts within `security.lockout_minutes`, which defaults to 15.

The account settings live under Security; the address-volume setting lives under Antispam. These controls are marked advanced. A successful sign-in clears the two account-specific buckets, not the shared address bucket.

If legitimate people are locked out, inspect the actual cause. Do not disable every protection or assume the problem is a wrong password. A password reset has its own independent limits.

## Set posting and upload limits

A flood interval is the minimum time between actions. An hourly cap limits total activity in an hour. Group daily posting and messaging allowances are separate again.

The upload allowance covers attachments and avatars. PostgreSQL stores counters across instances; fixture mode does not provide a writable rate-limit test environment.

Use [Groups and promotions](groups.md) for daily allowances and [Search settings](search.md) for search-specific controls. Verify the trusted proxy configuration if many unrelated visitors appear to share an address.

## Use flags and filters

Community flagging can hide content when the configured threshold is reached. Keep a moderator available to review the queue and reverse incorrect decisions.

Use the word-filter screen for supported content substitutions or restrictions, and check its preview before saving. Ban-filter patterns are globs, not regular expressions. Review where each filter applies; adding a registration filter is not a bulk deletion or retroactive ban of existing members.

## Diagnose blocked registration

Check whether registration is open, whether approval or email confirmation is required, whether a question has usable answers, and which rate-limit or filter message appears. Test from a normal browser session without repeatedly consuming the same limit. For missing confirmation mail, follow [Email](../operations/mail.md).
