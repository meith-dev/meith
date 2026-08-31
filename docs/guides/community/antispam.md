# Spam controls and filters

Everything a board has for keeping automated traffic out, bounding what
one visitor can do in an hour, rewriting words a reader should not meet,
and turning somebody away before an account exists. The rate limits and
challenges live in three places:

- **`/admin/antispam`** — the registration questions themselves.
- **`/admin/settings?group=antispam`** — every threshold on this page.
- **`/admin/settings?group=security`** — two of the three login
  counters, which are account controls rather than volume ones.

[The word filter](#the-word-filter) and [ban filters](#ban-filters), at
the end of this page, have screens of their own under `/admin`.

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
| Hold a new member's first posts | `antispam.moderate_first_posts` | Off | Most forum spam | One wait per genuine new member. |
| Hourly limits | `antispam.*_per_hour` | Off | A night's work by one script | Nothing, set sensibly. |
| The four pre-auth limits | see below | On | Signup floods, reset-mail bombing, password spraying | Nothing. |

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
cannot send. See [Operations § Mail](../operations/operating.md#mail).

## No hosted captcha

Not because it is hard: a hosted captcha means every visitor's browser
contacting a third party before they can join your board, which is a
decision about your members rather than a setting. The provider seam
(`CaptchaProvider` in `packages/antispam`) is there if you want one — a
small module, not a fork. See [the plugin API](../../customization/plugins.md).

## The word filter

The word filter rewrites words as a page is rendered. It is the board's
way of taking the sting out of language without editing anybody's post
or standing over the composer.

`/admin/content` holds it, under **Word filters**. It is an
administrator's control: a moderator's route to bad language is the
warning ladder or a hidden post, not this screen.

### What a rule is

Three fields:

- **The pattern** — the word to look for.
- **The replacement** — what to put in its place. It may be empty,
  which removes the word.
- **Whole word** — on, the pattern only matches when it stands alone as
  a word; off, it matches anywhere inside a longer one.

Matching is **case-insensitive**, and the replacement is inserted
exactly as you typed it. A rule with an empty pattern is ignored.

> [!IMPORTANT]
> **A pattern is a literal, not a pattern language.** Every character is
> matched as itself — `*`, `?`, `.` and the rest are just those
> characters. There are no wildcards and no regular expressions, so
> `.*` matches the two characters `.` and `*` and nothing else. If you
> want to catch several spellings of a word, that is several rules.

**Whole word is the setting that surprises people.** With it off, a rule
for `ass` rewrites the middle of *class*, *passage* and *assessment*.
With it on, only the word on its own is touched. Leave it on unless you
have a reason.

### What it changes, and what it does not

**The filter runs at render time. It never edits stored text.** The post
in the database is exactly what its author typed, and removing a rule
brings the original word back everywhere immediately. Nothing is
destroyed, so a rule is never a decision you have to live with.

Two consequences worth knowing:

- **A member who quotes a filtered post gets the original word**, because
  the quote is built from the stored text.
- **The moderation queue deliberately shows text unfiltered** — you are
  judging the words, so you see them. See
  [the moderator's guide](./moderation-guide.md#the-approval-queue).

The filter only touches the text a reader sees. It steps over HTML tags,
so it never rewrites a link's address, a class name or an attribute — a
rule for `cat` cannot break a link to `example.com/catalogue`.

#### Where it applies

| Filtered | Not filtered |
| --- | --- |
| Post bodies | Signatures |
| Thread titles, wherever a reader meets one | Custom profile fields |
| Excerpts in the latest-posts lists | Usernames |
| Search result excerpts, on the board and through the REST API | Forum names |
| Feed summaries and feed entry titles (RSS and Atom) | |
| The description in a page's metadata, which is what a link preview shows | |

**Thread titles are filtered everywhere a reader meets one**: the
heading of the thread page and its breadcrumb, every forum listing, the
last-post line on the board index, the latest panels and discovery
lists, search results, the list of threads a member follows, what
somebody online is said to be reading, the heading over the reply form,
feed entry titles, and the `<title>`, OpenGraph and structured-data tags
a link preview and a search engine read.

Two places see the stored title instead, each on purpose:

- **The moderation queue, the report screens and the mod control
  panel.** You are judging the words, so you see them.
- **The thread resource the REST API returns** under `/threads`. It is
  the record a client may write back, and a filtered title becoming the
  stored one is a loss the filter must never cause. The search results
  and subscription lists the API serves are display text, and they are
  filtered.

Nothing on the board offers a thread rename, so a filter rule is the
only way to take a word out of a title that is already there.

> [!NOTE]
> Notification subjects are not filtered — "New reply in …" keeps the
> stored title. A notification subject is composed once and becomes an
> e-mail and a push payload as well as a line on the board, so whether
> the filter should reach the mail a board sends is a separate question
> from what a page renders.

### What it costs

Very little. The compiled rules are cached board-wide and rebuilt when
you change one, and the substitution runs over text the board was
rendering anyway. The real cost is judgement: a filter that rewrites a
word into a joke reads as the board making light of something a member
was serious about, and members can tell the difference between a board
that removed a slur and one that made a punchline of it.

## Ban filters

A ban filter turns somebody away **before an account exists**. It is not
a ban: there is no member to ban yet. A person a filter matches never
registers, never appears in the member list, and never reaches the
approval queue.

`/admin/users/ban-filters` holds them. It is an administrator's screen —
a moderator's route to keeping somebody out is the warning ladder, a
ban, or asking an administrator. See
[the moderator's guide](./moderation-guide.md#bans-and-what-you-can-reach).

### What a filter is

Three fields:

- **Matches on** — one of three things a would-be member offers.
- **The pattern** — what that thing is compared against.
- **A note** — optional, seen only on this screen. Why the filter
  exists, so whoever reads it in six months knows whether it still
  needs to.

The screen also records who added each filter and when, and both adding
and removing one are written to the admin log.

The three kinds:

| Matches on | Compared against |
| --- | --- |
| **Username** | The name being registered, or the name of the account signing in |
| **E-mail address** | The address being registered, or the address on the account signing in |
| **Address the request came from** | The IP address the request arrived from |

A username or e-mail filter is compared **ignoring case**, so
`Spammer` and `spammer` are the same pattern.

### Patterns are globs, not regular expressions

This is the one thing worth reading twice.

- `*` matches any run of characters, including none.
- `?` matches exactly one character.
- **Every other character matches itself**, a full stop included.

So `.*` does not mean "everything". It matches the two characters `.`
and `*`, and almost nothing else. The pattern for every address at a
domain is `*@example.com`; the pattern for a range of addresses is
`198.51.100.*`.

> [!WARNING]
> A pattern of nothing but `*` would match everybody and is refused. If
> you want to stop all new members, close registration in the
> settings rather than filtering everyone out.

Two limits keep a pattern from being expensive or absolute: at most 200
characters, and at most 20 wildcards. A pattern past either is refused
when you save it. **A filter that would match you is refused too** —
saving a pattern that matches your own username, address, or network
would lock you out of the board with no way back through the interface,
so the screen will not let you.

### Where a filter is consulted

Every route into an account:

- A typed registration — the username, the address and the request's
  address are all checked.
- A sign-in — the request's address is checked before any password is
  verified, and the account's username and address once it is.
- A registration through a single sign-on provider, against the address
  the provider returned and the username it asked for.

Somebody a filter turns away is told the board cannot accept that
account and to contact an administrator. **The message never says which
of the three matched**, deliberately: naming the field would tell
somebody trying to get in exactly what to change.

Two places deliberately do not consult filters, because both are the
board's own way back in: **the installer**, which creates the first
administrator, and **`meith user create`** on the command line.

### What a filter does not do

- It does not touch an account that already exists. Somebody who
  registered before you added the filter keeps their account — but the
  filter is checked at sign-in too, so they cannot get back in. To
  remove them properly, ban the member.
- It does not tell you it matched. A refused registration leaves no
  member and no report; the admin log records the filter being added,
  not each person it turned away.
- It does not expire. A filter stays until somebody removes it, which
  is why the note field is worth filling in.
