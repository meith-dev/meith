# Discovery, feeds and search

## Spam controls

Reconfigure challenges after import. Meith provides a hidden-field trap, minimum registration time, question challenges, first-post moderation and hourly limits. No hosted or image CAPTCHA ships by default. Flood intervals and hourly caps are separate; see [Antispam](../administration/antispam.md).

## Activity and presence

| View | Behaviour |
|---|---|
| `/discover/new` | Threads active within 24 hours |
| `/discover/today` | Threads active since midnight in the reader's timezone |
| `/discover/participated` | Participated threads without that time window |
| `/discover/unread` | Signed-in member's unread threads |

Listings contain one row per thread. `?goto=unread` resolves the first visible post after thread/forum read markers; fully read threads fall back to the last page. With no read history it can land on the first post. Rendering a page marks the visited extent read.

Invisible members are omitted from both lists and counts for ordinary readers. Staff with `modcp.access` can see them; the historical peak counts everyone. Online locations are filtered by the viewer's permissions; inaccessible locations show a generic label. Query strings and admin locations are not exposed.

Board totals refresh every five minutes and show their timestamp. Before the first run they report that counting has not completed.

## Feeds

Tokenless RSS/Atom feeds always use guest visibility, regardless of cookies.

Members can create one private feed token at **User CP → Security** and append `?token=…` to a board, forum or thread feed. The token uses the member's current permissions and approved visible content. Treat the URL as a credential.

Any request carrying `token` returns `private, no-store`. Missing, invalid or revoked credentials fall back to the guest feed. Reissuing or changing the password revokes the old token; bans prevent member access. Discovery links remain tokenless.

## URLs and categories

Categories have pages at `/{id}-{slug}`. **Allow new threads** lets them contain threads; disabling it hides the listing without deleting threads or their URLs.

Each thread/forum page has its own canonical URL. Durable post links use `?post=<id>`, which resolves to the correct page and `#post-<number>` anchor. The number may change after deletions; the ID does not.

`/sitemap.xml` is an index of 5,000-URL chunks ordered by thread ID. A moved thread retains its ID and has no redirect stub in its former forum.

## Search

The advanced form supports forums/subforums, authors, dates, titles-only and post/thread results. Sort by best match, newest or oldest.

Results retain filters as URL refinements of a stored search. Refinements can only narrow its original scope. Clearing a refinement restores the original search without creating another search or consuming its flood interval.

Relevance ranks the 20,000 most recent matches. Counts and thread grouping use a bounded window; totals report when they exceed it. Forum/author breakdowns ignore current forum/author refinements so alternative counts remain stable. Newest/oldest post listings can traverse the full corpus; their counts and thread grouping remain bounded.

Thread results show the best matching post for the selected order. Subject, username, forum and thread sort columns are unsupported. Use filters instead.

Configure language, minimum word length and limits under [Search settings](../administration/search.md).
