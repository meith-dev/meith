# Spam controls and rate limits

Everything a board has for keeping automated traffic out, and for
bounding what one visitor can do in an hour. It lives in three places:

- **`/admin/antispam`** — the registration questions themselves.
- **`/admin/settings?group=antispam`** — every threshold on this page.
- **`/admin/settings?group=security`** — two of the three login
  counters, which are account controls rather than volume ones.

Most of it ships switched off — a fresh board has no spam on it, and a
feature that arrives switched on introduces itself by breaking your
registration form. What ships on is what no human ever notices: the
hidden-field trap, a three-second minimum fill time, and the four
pre-authentication limits below.

> [!NOTE]
> **The counters live in the database**, so every instance of your board
> shares one allowance — and a board running without Postgres (fixture
> mode, `pnpm dev`, the demo) has no counters and applies none of the
> rate limits on this page.

## What each control is worth

| Control | Setting | Ships | Stops | Costs a real visitor |
|---|---|---|---|---|
| Hidden-field trap | `antispam.honeypot` | On | Bots that fill every field | Nothing. Leave it on. |
| Minimum fill time | `antispam.min_form_seconds` | 3 seconds | Instant submissions | Occasionally somebody with a password manager. Keep it to a few seconds. |
| A question challenge | `antispam.captcha_mode` | Off | Scripted registration | A moment, every time. Switch it on when you have a problem. |
| Hold a new member's first posts | `antispam.moderate_first_posts` | Off | Most forum spam — but see the warning below | One wait per genuine new member. |
| Hourly limits | `antispam.*_per_hour` | Off | A night's work by one script | Nothing, set sensibly. |
| The four pre-auth limits | see below | On | Signup floods, reset-mail bombing, password spraying | Nothing. |

> [!WARNING]
> **`antispam.moderate_first_posts` does not currently hold anything.**
> The check asks the authorizer a per-forum question without naming a
> forum; the error that follows is swallowed and the answer defaults to
> *not held*, so an ordinary member's first posts go straight up whatever
> the threshold says. Use the forum's own **Hold new threads / new
> replies for approval** switches, or the per-group *requires approval*
> rows in [the matrix](./forums.md#reading-the-matrix), until this is
> fixed.

## The registration questions

Set **Registration challenge** to *Ask a question* and `/admin/antispam`
becomes the list of questions. Each question carries any number of
accepted answers; a registering visitor gets one question at random.

- **Answers are compared loosely** — trimmed, lower-cased, and with runs
  of whitespace collapsed — so `The Blue Door` matches `the blue door`.
- **Answers are not secret.** Anybody determined enough reads them off
  the board; the questions stop scripts, not people.
- **A challenge switched on with no usable question does nothing** rather
  than refusing everybody. That is deliberate, and the screen says so in
  red at the top.

## The limits on pages nobody has signed in to

The hourly limits above are about members posting. Four more sit on the
pages a visitor reaches before they have an account, and unlike the rest
of this screen they **ship switched on** — each closes a hole that costs
nothing to keep shut:

| Setting | Default | Counted per | What it stops |
|---|---|---|---|
| `antispam.register_ip_per_hour` | 10/hour | requesting /24 (or /48) | A script working through a list of usernames. Independent of the challenge, so it covers the default board, which has none. |
| `antispam.reset_per_hour` | 5/hour | target e-mail address | Somebody using your reset form to mail-bomb one person. |
| `antispam.reset_ip_per_hour` | 20/hour | requesting /24 (or /48) | The same caller working through a list of addresses, probing which have accounts. |
| `antispam.login_ip_attempts` | 100 per lockout window | requesting /24 (or /48) | **Spraying** — one guess each against a thousand accounts, which trips no per-account counter. |

The reset form answers identically whether it sent a mail, declined to,
or refused on a limit — a form that says "too many requests for that
address" has confirmed the address has an account.

Set any of them to `0` to switch it off. The one to look at is the first,
and only if your members share an address — a school, an office, a
conference: ten accounts an hour from one /24 is generous for a board and
low for a lecture hall.

## The three login counters

A failed sign-in is counted three times over, and the three answer
different attacks. Two are account controls and live in the **security**
settings group; the third is a volume control and lives with anti-spam:

| Counter | Setting | Default | Trips when |
|---|---|---|---|
| Per account, per address | `security.max_login_attempts` | 5 | Somebody guesses at one account from one place |
| Per account, everywhere | `security.max_account_login_attempts` | 50 | The same guess is spread over many addresses |
| Per address, any account | `antispam.login_ip_attempts` | 100 | One address sprays single guesses across many accounts |

All four of these — the three counters and the lockout window — are
marked **advanced**, so the settings screen hides them until you ask for
advanced settings.

All three counters are measured over `security.lockout_minutes` (default
15).
Successful sign-in clears the two account-specific buckets; **the shared
address bucket is deliberately not cleared**, and empties only when its
window expires, so one valid sign-in cannot wipe the history of guesses
against unrelated accounts.

The middle one is the uncomfortable one: it locks the **real owner** out
too, which is the price of it working at all against a botnet. Keep it
well above the per-address number — and remember that a genuinely
locked-out member can still reset their password; the reset form is a
separate door with limits of its own.

Signing in to the admin panel again after the fifteen-minute
re-authentication window has its own counter, on the same
`security.max_login_attempts` number and the same lockout window, keyed
to the member and their address.

## Limits and the flood interval are different controls

| | What it bounds | What it stops |
|---|---|---|
| Flood interval (`posting.flood_seconds`, default 15) | The minimum gap between two actions | A double-click |
| Hourly limit (`antispam.post_per_hour`) | How many actions in an hour | A script posting steadily all night |

A script satisfies any interval you would be willing to set — every 31
seconds, all night, is thousands of posts and never breaks the rule. Use
both. Members with **bypass flood check** are exempt from both — but not
from [the daily post allowance](./groups.md#the-daily-post-allowance),
which is a group permission rather than a board setting.

Searching has an interval of its own, `search.flood_seconds`, defaulting
to 30 — searching is the most expensive thing a signed-out visitor can
ask for.

## The hourly limits, one by one

Each is a bucket per member — or, for a signed-out visitor, per
requesting /24 — over a fixed hour. `0` disables the limit, and all five
ship at `0`.

| Setting | Counts |
|---|---|
| `antispam.post_per_hour` | Threads and replies together |
| `antispam.search_per_hour` | Searches |
| `antispam.message_per_hour` | Private messages, per sender — one message to ten people is one send |
| `antispam.report_per_hour` | Reports of a post to moderators |
| `antispam.upload_per_hour` | Attachments and avatars |

A limit on reporting is a limit on asking for help, so set that one high
enough that a member having a bad day is not silenced.

### The upload allowance covers both kinds of upload

`antispam.upload_per_hour` is one bucket, and both things a member can
upload spend from it: files attached to a post — one unit each, so
attaching six files in one post costs six — and a new avatar, one unit
per attempt. The avatar spends its unit before the image is examined, so
a rejected image costs one too; submitting the form with no file chosen
costs nothing, and removing an avatar costs nothing, because it uploads
nothing.

## If registration stops working

Check `/admin/antispam` and the anti-spam settings first:

- A **question challenge** switched on with no question configured does
  nothing rather than refusing everybody — deliberately, and the screen
  says so.
- A **minimum fill time** set to a minute quietly turns away most real
  applicants. This is the usual culprit.
- **Registrations per hour from one address** at its default of 10 is
  generous for a board and low for a hall full of people on one
  connection.

If registrations are *created* but nobody can sign in afterwards, it is
not anti-spam — it is the activation method waiting for mail the board
cannot send. See [Operations § Mail](./operating.md#mail).

## No hosted captcha

Not because it is hard: a hosted captcha means every visitor's browser
contacting a third party before they can join your board, which is a
decision about your members rather than a setting. The provider seam
(`CaptchaProvider` in `packages/antispam`) is there if you want one — a
small module, not a fork. See [the plugin API](./plugin-api.md).
