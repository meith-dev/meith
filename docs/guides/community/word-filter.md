# The word filter

The word filter rewrites words as a page is rendered. It is the board's
way of taking the sting out of language without editing anybody's post
or standing over the composer.

`/admin/content` holds it, under **Word filters**. It is an
administrator's control: a moderator's route to bad language is the
warning ladder or a hidden post, not this screen.

## What a rule is

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

## What it changes, and what it does not

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

### Where it applies

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
last-post line on the board index, the latest-threads and latest-posts
panels, the discovery lists, search results, the list of threads a
member follows, what somebody online is said to be reading, the heading
over the reply form, RSS and Atom entry titles, and the `<title>`,
OpenGraph and structured-data tags a link preview and a search engine
read.

Two places see the stored title instead, each on purpose:

- **The moderation queue, the report screens and the mod control
  panel.** You are judging the words, so you see them.
- **The thread resource the REST API returns** under `/threads`. It is
  the record a client may write back, and a filtered title becoming the
  stored one is a loss the filter must never cause. The search results
  and subscription lists the API serves are display text, and they are
  filtered.

Nothing on the board offers a thread rename, so a filter rule is the
only way to take a word out of a title that is already there. Splitting
posts out into a new thread is the one place a moderator types a title,
and that is a new title rather than an edit of the old one.

> [!NOTE]
> Notification subjects are not filtered — "New reply in …" keeps the
> stored title. A notification subject is composed once and becomes an
> e-mail and a push payload as well as a line on the board, so whether
> the filter should reach the mail a board sends is a separate question
> from what a page renders.

## What it costs

Very little. The compiled rules are cached board-wide and rebuilt when
you change one, and the substitution runs over text the board was
rendering anyway. A long list of rules is fine; it is one pass per rule
over the visible text of a page.

The real cost is judgement. A filter that rewrites a word into a joke
reads as the board making light of something a member was serious about,
and members can tell the difference between a board that removed a slur
and one that made a punchline of it.
