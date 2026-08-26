# Reputation

Reputation is members rating each other. It gives a board a cheap,
member-driven signal of who is worth reading — and, wired to
[promotions](./groups.md#promotions), a way to move people into a group
once the community has vouched for them.

`/admin/settings?group=reputation` holds the four switches. This page is
what each is worth, and what turning it on actually changes on a post.

## What a rating is

**−1, 0 or +1. That is the whole scale**, and it is the same for
everybody: there is no per-group multiplier, so a moderator's rating
counts exactly as much as a new member's. A rating outside that range is
refused rather than clamped.

What a group *can* change is whether its members may rate at all, and
how many ratings a day they get. Both live on the group, not here —
see [Groups](./groups.md#a-groups-permissions).

A rating may carry a comment of up to **500 characters**, and may be
attached to a particular post or given on the member's profile.

## The four settings

### Reputation enabled

Off hides every rating control and every total across the board.
**Existing ratings are kept**, so this is reversible: switch it back on
and the numbers return exactly as they were. It is a display and
enforcement switch, not a delete.

### Allow negative ratings

Off — the default — makes reputation a **thanks button**. Members can
say a post helped and nothing else. On, they can rate somebody down as
well as up.

Most boards want it off. A downvote is the part of reputation that
generates arguments, and a board that only records thanks gets most of
the signal with none of the fights.

### Require a comment

On, a rating must say why. Off — the default — it need not.

### Posts required before rating

A brand-new account cannot rate anybody until it has posted this many
times. **5 by default**, `0` to switch the requirement off. It is aimed
at the throwaway account registered to upvote one post.

## The two settings that change what a post shows

This is the part worth reading twice, because two independent switches
decide between **one-press thanks** and **a form**, and the answer is
not obvious from either switch alone.

| Allow negative | Require a comment | What a post offers |
| --- | --- | --- |
| off | off | **Thanks button only.** One press, no form. |
| off | on | A form. The Thanks button is gone. |
| on | off | Both — a Thanks button *and* a Rate form. |
| on | on | A form. The Thanks button is gone. |

Two rules produce that table:

- **A rating form appears when there is something to choose** — a
  direction, a reason, or both. With negatives off and comments not
  required there is nothing to fill in, so the board does not ask.
- **The Thanks button disappears the moment a comment is required**,
  because one press cannot carry a reason.

So *Require a comment* is not only a rule about what a rating must
contain. It removes the one-click path entirely, and on a board where
thanking a good answer should be effortless, that is the cost of turning
it on.

## Who may rate, and how often

Every rating passes the same checks, in this order:

1. **Reputation is enabled** board-wide.
2. **Nobody rates themselves.** Refused outright.
3. **The rater's group allows it** — the *Can give reputation*
   permission.
4. **The rater has posted enough**, against *Posts required before
   rating*.
5. **The rating is in range**, and is not negative on a board with
   negatives switched off.
6. **A comment is present** if one is required, and is within 500
   characters.
7. **The rater is under their daily allowance.**

The daily allowance is a **group numeric permission**, so it follows the
rules every numeric permission follows: the most generous value across a
member's groups wins, and **`0` means unlimited, not none** — see
[Groups](./groups.md#numbers-behave-differently-from-switches). The day
is a **UTC day**, a fixed window aligned to midnight UTC rather than a
per-member calendar.

A member may **withdraw** a rating they gave.

## The totals are counted, not tallied

A member's reputation total is **rebuilt with a `sum` over the live
ratings**, inside the same transaction as whatever changed them — a new
rating, a withdrawal, or an account merge, which recounts every affected
account.

It is not a running counter that gets `+1`ed. That matters to you for
one practical reason: **the total cannot drift.** There is no state to
repair, no recount command to run, and a rating that is withdrawn or
revised is reflected immediately and exactly. The same approach is used
for warning points and for the thread and post counters.

## What else reads reputation

**Promotion rules.** A rule can require a minimum reputation before it
moves somebody into a group — see
[Groups § Promotions](./groups.md#promotions). This is the main reason
to keep reputation on even if you never show it prominently: it is a
measure of standing the community produced itself, rather than one an
organiser assigned.

Reputation is imported from MyBB and phpBB boards. A MyBB
`reputationpower` multiplier has no equivalent here and is dropped
rather than silently scaling the totals it produced —
[MyBB parity](../../reference/mybb-parity.md#reputation) has the
reasoning.
