# MyBB migration: search and discovery

Review search, discovery, feed visibility and spam-control differences on a board imported from MyBB.

## Spam

### No hosted captcha, and limits beside the interval

**MyBB:** ships a built-in image captcha, supports reCAPTCHA and hCaptcha,
and models flood control as a per-usergroup interval.

**Meith:** ships a honeypot, a fill-time floor, admin-defined question
challenges and first-post moderation, plus hourly limits on posting,
searching, private messages, reports and uploads. There is no image
captcha and no hosted provider.

**Why.** Three separate reasons:

- *No image captcha.* Generating one means rendering text to an image
  (a dependency), the accessible fallback is an audio challenge (another),
  and both are defeated by commercial solvers for less than they cost to
  run. A question a regular can answer and a script cannot is weaker
  against a determined human and stronger per unit of effort.
- *No hosted provider by default.* hCaptcha and reCAPTCHA work, and they
  mean every visitor's browser contacting a third party before they can
  register. That is a decision about a board's members rather than a
  setting, so the `CaptchaProvider` seam is shipped and the service is
  not.
- *Limits beside the interval, not instead of it.* An interval does
  nothing about a script that posts every 31 seconds all night, so the
  board adds a *limit* — how many in an hour — counted in the database so
  every instance shares one allowance. The two answer different questions
  and both are configured.

**Cost.** An imported board's captcha configuration does not carry over;
the challenge has to be set up again and the questions written. Its flood
settings map onto the interval; the hourly limits start at zero.

---

## Reading and discovery

### "New posts" lists threads, and its window is a day, not your last visit

**MyBB:** `search.php?action=getnew` runs a search for posts since
`lastvisit` and shows the threads those posts are in.

**Meith:** `/discover/new` lists threads whose last post landed in the
last 24 hours; `/discover/today` uses midnight in the member's own
timezone. Both are thread listings ordered by last post,
permission-filtered in SQL and keyset-paged.

**Why.** A genuine "since your last visit" needs the per-thread read
state, and folding that into this query means a join per row or a second
query per page — against a screen with a p95 latency budget the load
harness enforces. MyBB pays that cost as a full search run per page
view, which is why the screen is one of the heaviest on a large board
and why several hosts disable it.

**Cost.** A member who has been away a week sees a day, not a week. The
label says so, and `/discover/participated` and the subscription list
have no window at all.

### A busy thread is one row, not forty

**MyBB:** the "new posts" screens are searches over *posts*, so a thread
with forty new replies contributes forty hits — collapsed by the
template, but counted, paged and ranked as forty.

**Meith:** every discovery view returns one row per thread, and the
limit is a limit on threads.

**Why.** "What is new" is a question about conversations. Paging over
posts means a page of twenty hits can be three threads, and one busy
thread buries the rest of the board.

**Cost.** The row says when the last post was and who wrote it, but not
how many of the replies are new to this reader. `/discover/unread`
answers the coarser question — has anything landed here since I last
read it — for a signed-in member, but a row on any other view still
cannot say how many.

### Jumping to what is new costs nothing until it is clicked

**MyBB:** `newreply.php?tid=` with `goto=newpost` scans the thread's
posts for the first one past `lastvisit` on every request, whether or
not the link is ever followed.

**Meith:** an unread row's link carries `?goto=unread` in the `href`
itself — a plain query string a no-JavaScript reader can follow like
any other. The thread route resolves it only when that request
arrives: it reads the member's per-thread and per-forum markers, finds
the first visible post past them, and redirects to the page holding it
with a `#post-N` anchor; a thread that turns out to be fully read
falls back to its last page. Reading it up to where it renders is
separate — the thread page marks the visited page read as it builds
the response, the same one write the view counter already makes, so the
read is committed by the time the page arrives. A thread rendered to the
end fully covers its own unread state this way; the "Mark read" button
still exists for a member who wants to leave a thread without reading
it all.

**Why.** The forum, discovery, and board-index listings already know
whether a thread is unread — that is one lookup per row anyway, needed
for the badge — but *where* the first unread post sits still costs a
query building the listing does not otherwise pay. Deferring that
question to the click means the listing pays a fixed cost and the
resolver runs only when its answer is actually wanted.

**Cost.** A member who has never read a thread and follows `?goto=unread`
gets its very first post — correct by definition, but a large thread
that is only unread through one recent reply feels like the jump
undershot.

### Invisible browsing hides you from the count as well as the list

**MyBB:** `users.invisible` removes a member from the online list; the
"N users online" figure still counts them.

**Meith:** the same setting removes the member from the **count** too,
for everybody who cannot see them. Staff — anybody with `modcp.access` —
see them listed and marked.

**Why.** A member removed from the list but left in the total can be
found by subtraction: "eleven online, ten listed" names an invisible
member as surely as printing their name. Hiding somebody halfway is
worse than not offering the setting.

**Cost.** The visible total differs between staff and everybody else,
which looks like a bug until you know why. The "most ever online" record
counts everybody, invisible included — it is a fact about the board's
traffic, not about who anybody may see — so the record can exceed any
total a member has been shown.

### The online list names a location only when the reader may know it

**MyBB:** the online list shows each user's location resolved without
reference to the reader — private forums leak by title through this
screen on stock MyBB.

**Meith:** the location is resolved **in the query, against the reader's
own permissions**. A forum they cannot see arrives at the page as null
and renders "Somewhere on the board" — there is no title in the data for
a theme, a feed or a debug dump to print. A thread needs its forum to be
nameable *and* the thread to be in the reader's content scope, so a
moderator reading a soft-deleted thread does not put its title on the
front page.

**Why.** The alternative is fetching titles and letting the page decide,
which puts the decision in every theme anybody writes, and one of them
will get it wrong.

**Cost.** The online list cannot be cached across readers — it is one
query per reader, which is why it is one query. The location is stored
without a query string, so "reading page 4" is not distinguishable from
"reading page 1", and a member browsing the admin panel shows as
somewhere on the board rather than in the panel.

### Board totals are a rollup with a timestamp, not a live count

**MyBB:** `datacache` holds the board statistics, updated on the write
path — every new post, thread and member updates the cached figures.

**Meith:** a scheduled task recomputes them every five minutes, and the
page says when it last ran. Before the first run the panel says "not
counted yet" rather than showing zeroes.

**Why.** The member count is a count of `users`, and the board index is
the most-requested page there is. Updating on the write path makes
every post pay for a number nobody reads on the posting screen — plus a
cache that drifts with no way to notice. The thread and post totals are
summed from the root forums, whose counters have already accumulated
the tree; the member count is what sets the shape.

**Cost.** The numbers on the index can be five minutes old. They say
so — and a brand-new board says "not counted yet" until the first tick,
which is a truer statement than three zeroes.

---

## Feeds, URLs and the sitemap

### A feed shows what a signed-out visitor sees, whoever fetches it

**MyBB:** `syndication.php` resolves the requesting user from their
cookie and filters the feed against their permissions — a signed-in
member's feed carries their private forums.

**Meith:** every feed under its shared address is built from the
**guest** scope, regardless of who asks — unless the reader appends their
own **feed token** (below), which is the one way to get a personalised
feed, and never from the cookie.

**Why.** A feed URL is handed to software, not read in the browser that
holds the cookie. Aggregators, corporate proxies and CDNs cache one
response per URL and serve it to everybody who asks next — so a
personalised feed under a shared address is a private forum served to a
stranger, in somebody else's cache. MyBB's version is only safe because
most readers never send the cookie at all.

**The feed token.** A member mints one from *User CP → Security*, shown
once, in the shape `forum_feed_<lookup>_<secret>` — the same design as a
personal access token: a public lookup segment for an O(1) row lookup,
and a secret kept only as its SHA-256 hash, never stored raw. Appending
it as `?token=…` to any feed address — `/feed.xml`, `/atom.xml`, a
forum's `/{id}-{slug}/feed.xml`, a thread's feed — builds that feed
through the **same Authorizer and visibility filter a page view uses** for
that member. The token is a restriction on an actor, never a grant: the
feed carries exactly the forums the member can already see and no more,
approved-and-visible content only (a "your threads only" forum narrows to
the member's own threads, just as on the board).

**No oracle.** A missing, malformed, guessed or revoked token is not an
error. It resolves to the guest scope and returns the ordinary guest
feed, with the same status and body a signed-out reader gets — there is
no response that tells "wrong token" apart from "no token", so the
address is neither an account- nor a token-validity oracle. Any request
carrying a `token` parameter — valid or not — is answered
`Cache-Control: private, no-store`, so a shared proxy never keeps a
personalised copy, and because the header keys on the *presence* of the
parameter rather than on whether the token was good, it cannot itself
leak validity. Tokenless feeds stay guest-scoped and publicly cacheable,
exactly as before.

**Revocation.** One token is live per member; minting again retires the
old one immediately. Changing the password drops the token too — the same
event that signs out other devices — and a ban neutralises it at
resolution time: a banned actor's audience is empty, so the token shows
nothing until the ban lifts, without a stored flag to keep in step. The
raw token is never written into page markup except its one-time reveal;
the autodiscovery links a page advertises stay tokenless, so a member
opts in to their private URL by copying it, never by loading a page.

### A category is a page, not only a heading

**MyBB:** a category is a heading on the index and a
`forumdisplay.php?fid=` page of its own.

**Meith:** the same — `/{id}-{slug}` on a category renders its forums,
using the index's own blocks so the two never drift apart. It exists
because the breadcrumb on every thread and forum page names the
category, and a named ancestor that 404s is a trail that stops halfway.

**Cost.** One more page per category to keep working. It shares the
index's view model, so the cost is a route rather than a feature.

### A category can hold threads of its own, if an admin says so

**MyBB:** a category holds forums and nothing else.

**Meith:** **Allow new threads** on a category — off on every category
until an admin turns it on — makes it take threads as well as forums.
Its page then lists them the way a forum's does, and it becomes a
destination a thread can be moved into.

**Why.** The difference between a category and a forum was never about
what a member wanted to do there; it was about where the software would
let them post. A small board is one heading with a handful of threads
under it, and asking it to invent a forum inside a category is the
software's filing system leaking into somebody's front page.

**Off by default is the whole feature:** a category that takes threads
without being asked has quietly become a forum.

**Cost.** Turning it back off stops new threads and returns the page to
its forums. Threads already posted keep their addresses and stay in
search, but the category no longer lists them until it is turned back
on — or they are moved.

### Every page of a thread is its own canonical URL

**MyBB:** emits no canonical link, leaving duplicate URLs for one page
for the crawler to work out.

**Meith:** every thread and forum page carries `rel="canonical"` naming
**the page being read**, with the permalink, cursor and reveal
parameters dropped.

**Why.** The tempting version points every page at page 1, and it is
worse than none: it asks a crawler to drop every page but the first
from its index, which is why so many forums are searchable only for
their opening posts. What a canonical is actually for here is
collapsing `?post=`, `?after=` and `?reveal=` — three ways to reach one
document.

**Cost.** A permalink to post 812 is canonicalised to the page
containing it, so a search result lands on the page rather than the
post. The anchor still works for anybody who follows the original
link.

### A post is anchored by its number, and reached by its id

**MyBB:** links a post as `showthread.php?pid=1234#pid1234` and prints
`#6` beside it. The two never agree, and the one a reader copies is the
one they cannot read.

**Meith:** there is one anchor, `#post-6` — the number the corner
shows. Everything the board writes — notifications, search hits, feed
entries, last-post links, a quote's link back — links `?post=1234`
instead, and the thread page answers that by finding the post and
redirecting to the page holding it, anchored at its number.

**Why.** The two jobs conflict. "The sixth post in this thread" is what
a person means, and it moves when an earlier post is deleted; "post
1234" is what a stored link means, and it must not move at all.
Splitting them across the query and the fragment lets each be what it
is. It is also the only way the link *lands*: a fragment is never sent
to the server, so `#post-812` can only work when the post happens to be
on the page that loaded — resolving `?post=812` server-side finds the
page as well as the anchor.

**Cost.** One redirect per link followed. A board that served the
anchor directly makes none — and lands the reader at the top of page
one whenever the post was not on it.

### The sitemap is an index of chunks, ordered by id

**MyBB:** ships no sitemap; plugins that add one generally emit a
single document.

**Meith:** `/sitemap.xml` is always an index. Chunks are 5,000 URLs,
keyset-paged on the thread id ascending.

**Why.** One document does not survive the target data volume, and
switching shapes later means every crawler that cached the old one has
to rediscover the new — so it is an index from the first thread. The
ordering is by id rather than activity because a crawler works through
the chunks over hours or days, and a boundary that moved whenever
somebody posted would make the crawl skip threads and revisit others.

**Cost.** A chunk request pays one skip into the primary-key index to
find its starting id, because the index names the chunks by number
before any of them exists. It is paid by crawlers, not readers.

---

## Search

### The search form has an advanced half

**MyBB:** two forms — a one-line box in the header, and a full page
with forums, an author, a date bound, "titles only", a sort column and
a direction.

**Meith:** one form, with the second half behind a disclosure that
opens itself whenever anything in it is set. It carries the same axes,
named for what they do: a forum (with **include subforums**, so a
category is one click rather than eight), one or more authors, a date
window, titles-only, post-or-thread results, and the order.

**Why.** The plain box is what almost every search is, and a form that
opens on eight controls asks a reader to answer questions they do not
have. The disclosure state is the app's decision rather than the
browser's, because a search that *was* narrowed and comes back looking
unnarrowed is a bug report waiting to happen.

### Results are filtered where they are read, not by searching again

**MyBB:** the results page is a listing; narrowing it means going back
to the form and running another search — another entry against the
flood interval.

**Meith:** the results page carries the filters with it. The stored
search holds the words and the options it ran with; the results URL
carries a *refinement* on top — a forum, an author, a window, an
order — and the page re-runs the stored search with both applied.
Anything already applied is also a chip, with an href that removes only
itself.

**Why.** A stored search is a token and a set of words, and re-running
it is what the page already does on every open to re-check the reader's
access. A filter in the URL is therefore free of everything a new
search costs: no row, no flood interval, no lost link — and "clear
filters" is a link rather than a re-type.

### A refinement narrows and never widens

**Meith:** a refinement can only make the result set smaller. A search
run against one forum cannot be refined into another; a titles-only
search cannot be refined back into whole posts; a past-week search
cannot become a past-year one. Where the two disagree, the narrower
wins; clearing the refinement is what returns the search to what it
was.

**Why.** The results URL is a link people paste, and a link that
quietly returns *more* than the search it came from is one that leaks.
The rule is small enough to hold in the head: this page shows a subset
of that search, always.

### Counts and breakdowns are bounded by the same window

**MyBB:** counts the whole match set.

**Meith:** counts the first 20,000 matches and says so when it stops
there. The same pass produces the per-forum and per-author breakdowns
the filter panel shows, and those counts deliberately ignore the forum
and author refinements already applied, so the numbers beside the other
forums hold still as a reader moves between them.

**Cost.** On a board where a term matches more than twenty thousand
posts, the total reads "more than 20,000" where MyBB printed an exact
number, and the per-forum counts beside it are floors.

### Sorting offers three orders, not six columns

**MyBB:** sorts by relevance, subject, date, thread, forum or username,
either direction.

**Meith:** best match, newest, oldest.

**Why.** Paging here is keyset, not `OFFSET` — `(rank, id)` for
relevance, `id` for the date orders — so a reader paging through
results cannot have rows shuffle or repeat underneath them when
somebody posts. A sort by username or subject has no such key, and the
honest implementations are an `OFFSET` pager over an unbounded ranked
set or an index per column — neither worth what it costs to answer a
question the filters answer better: a reader sorting by username wants
one member's posts, which is what **posted by** does.

**Cost.** A member who sorted by subject, thread, forum or username has
no equivalent order and reaches the same set through **in** and
**posted by** instead.

### One row per thread is a grouping, not a second query

**MyBB:** "display results as threads" returns thread rows.

**Meith:** the same, and the row shown for a thread is its *best* match
under the current order — the highest-ranked post for relevance, the
newest for newest. Grouping is bounded by the same window as ranking.

### Relevance is ranked within a window

**MyBB:** ranks every matching post, however many there are.

**Meith:** ranks the **20,000 most recent matches** when sorting by
relevance. Sorting by newest or oldest reads the whole corpus, unless
the search groups by thread or asks for a count, both of which are
bounded the same way.

**Why.** `order by ts_rank_cd(...)` cannot use an index: a relevance
score depends on the query, so there is nothing to have indexed in
advance, and Postgres has to score every matching row before it can
name the top twenty. The load run measured the cost on a board of
2.3 million posts: a term matching 96% of them took a p95 of
**5.5 seconds** — the GIN index present and used throughout; the cost
was the ranking, not the lookup. A term matching 1,171 posts, through
the same code, took 35 ms. Bounding the ranked set brought the first
case to 98 ms.

**Who this affects: almost nobody.** For any term matching fewer than
20,000 posts the window contains the entire match set, so the results
are *identical*. The difference appears only for a term so common that
"the single most relevant post" is not a meaningful thing to ask for —
and there the answer becomes "the most relevant of the recent ones",
which is what a member searching a ubiquitous word actually wants. The
alternative was a five-second page.

**What was not done.** A search extension (RUM, or an external engine)
would rank the whole corpus quickly and properly. It is a runtime
dependency and, on most managed Postgres, an extension the operator
cannot install — so it stays out until somebody has a board that needs
it.
