# Search

Search is the most expensive thing a visitor can ask a board to do, and
on a busy board it is the first thing to misbehave. This page is the
five controls over it and what each is actually worth.

Four live under `/admin/settings?group=search`. The fifth is a rate
limit and sits with the [spam controls](./antispam.md).

## The language a board is written in

**Search language** is the one control here that changes what a search
*finds*, not how often or how much it costs. It names the Postgres
text-search configuration used to reduce words to their stems — both as a
post is indexed and as a member's query is parsed — so a search for one
form of a word finds the others. On a German board the German
configuration ties *Häuser* to *Haus*; English, left in place, would file
them as two unrelated words and answer a search for one with none of the
other.

The choices are Postgres's own built-in configurations — English, German,
French, Spanish, Russian and the rest of the stock set — plus **No
stemming (exact words)**, which indexes and matches whole words only. No
stemming is the honest choice for a board that mixes languages: it never
guesses a stem wrong, at the cost of never finding a plural from its
singular. The default is English.

The board indexes and searches under **one** configuration. It has to be
the same on both sides — a document stemmed one way and a query stemmed
another would not meet — so the two are always taken from this single
setting and can never drift apart.

### Changing it reindexes in the background

The stem of every word already in the index was decided by the old
configuration, so changing this setting schedules a reindex: the
**search reindex** task rewrites each post's document under the new
configuration, a batch at a time, the same task that first builds the
index for a board adopting search. Its progress shows on the system page
at `/admin/system` as a pending count that falls to zero. Nothing goes
dark while it runs — a post stays findable under the old configuration
until its turn comes — but a search may miss a not-yet-rewritten post's
newly-stemmable forms until the backfill reaches it.

Only the language names offered here ever reach the database: the stored
value is checked against that fixed list before it is used, and a value
that is not on it falls back to English rather than being trusted. The
list is the board's guarantee that a setting can never become a way to
inject SQL into the index.

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
