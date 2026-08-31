# Search

Search is the most expensive thing a visitor can ask a board to do, and
on a busy board it is the first thing to misbehave. This page is the
four controls over it and what each is actually worth.

Three live under `/admin/settings?group=search`. The fourth is a rate
limit and sits with the [spam controls](./antispam.md).

## Switching search off

**Enable search** does four things at once, and the fourth is the one
that makes it a safe thing to try:

- The **Search link leaves the board navigation**.
- **`/search`**, and any results page still linked to, is replaced with a
  line saying search is off.
- **`GET /api/v1/search` answers 403.** An API token is not a way round
  the setting.
- **The index is kept, and goes on being maintained.** Posts written
  while search is off are still indexed.

That last point is why this is reversible at no cost: switching it back
on needs no reindex and loses nothing. It is a reasonable thing to do
for an afternoon while a board is under load.

## The shortest word a search may rest on

A search is refused unless **at least one of its words** is this long.
The default is 2, so at 3 the search *a good post* runs and *a b c* does
not.

The short words are **not dropped**. They are still sent to the index,
which decides for itself which of them carry no meaning. The setting is
a floor on the query as a whole, not a filter on its words — it exists
to refuse the searches that scan the most and mean the least.

Raise it if the expensive searches on your board turn out to be short
ones. Most boards never need to.

## Two different limits on how often

These are separate controls and they answer different problems. Setting
one does nothing about the other.

**The search flood interval** (`search` settings, 30 seconds by default)
is the minimum gap between one member's searches. It is per member, it
is about impatience, and a member who is over it is told how long to
wait. A group with **bypass flood check** is not subject to it.

**Searches per hour** (`antispam` settings, `0` — off — by default) is
an hourly cap, and it is aimed at the visitor who is not a member at
all. `0` means no cap rather than no searches, as everywhere else in
those settings. See [Spam controls](./antispam.md) for how the hourly
allowances work and what they cost a real visitor.

If a board is struggling under search load, the hourly cap is usually
the one to reach for. The flood interval slows a person down; the hourly
cap is what stops a script.

## What a result shows

Search results carry an excerpt from the post, and **the excerpt has the
[word filter](./antispam.md#the-word-filter) applied**. The thread title
beside it does not — see that section for what the filter covers.

Results obey permissions. The scope is built from the same forum
audience the rest of the board uses, so a member never sees a hit in a
forum they could not open. **Administrators and super moderators also
see unapproved and deleted posts** in results, which is deliberate — it
is how you find something that was hidden — and is worth knowing before
you read a staff member's result count as the board's.
