# Search settings

Open `/admin/settings?group=search`.

## Language

Select the PostgreSQL search language for the board's content. English is the default. **No stemming (exact words)** suits mixed-language content but does not match related word forms.

A language change queues reindexing. Monitor the pending count under **Admin → System**; matches may vary until it finishes. If progress stops, check [scheduled tasks](../operations/scheduled-tasks.md).

## Availability and limits

Disabling search removes its navigation link and disables the page and API endpoint. The index remains maintained; re-enabling does not require a rebuild.

Set the minimum word length and flood interval. At least one query word must meet the minimum. The hourly cap is under [Antispam](antispam.md).

## Verify

Search for known public and private content as a guest and representative members. Results must match their forum permissions. See [Search behaviour](../operations/mybb-discovery.md#search) for ranking and result limits, or [Operator commands](../operations/operator-cli.md) for rebuilding.
