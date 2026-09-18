# Configure search

Open **Board settings → Search** at `/admin/settings?group=search`. These settings control the board's search feature; members looking for discussions should start with the [Member guide](../members/member-guide.md).

## Choose the search language

Select the PostgreSQL text-search language matching the board's main content. It controls word stemming for both indexing and queries. English is the default. **No stemming (exact words)** is useful for mixed-language content, but does not match word forms through a shared stem.

Changing the language schedules a background reindex. Watch its pending count under **Admin → System**. Existing content remains available, but matches can differ until every post has been reindexed.

If the count does not progress, ask the operator to check [Scheduled tasks](../operations/scheduled-tasks.md).

## Enable or disable search

Turning search off removes the navigation link and disables the search page and API search endpoint. It preserves the index and continues maintaining it. Turning search back on does not require rebuilding the index simply because it was disabled.

## Set query limits

Set the minimum word length required for a query. At least one query word must meet that minimum; other short words can still be part of the query.

The flood interval and hourly cap are different controls. The flood interval is under Search; the hourly cap is under [Spam controls](antispam.md). Review both before diagnosing a member who is asked to wait.

## Verify results

Search for known content using a normal member account, a guest and a member of a private group. Results respect content visibility and forum permissions. Filters narrow the permitted results rather than granting access to another forum.

Ranking and result windows have limits; the [search behavior reference](../operations/mybb-discovery.md#search) explains the detailed behavior relevant when migrating from MyBB. For a manual rebuild, use [Operator commands](../operations/operator-cli.md).
