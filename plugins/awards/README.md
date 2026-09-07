# @meith/plugin-awards

Community awards, manual recognition and achievements.

## What it adds

- A public catalogue at `/plugins/awards`, award holder pages and member award pages.
- Admin award creation, ordering, archiving, manual assignment and revocation.
- Icons beside posts, a profile panel and a seven-day dashboard count.
- Per-award multiple grants, optional notifications and public reason controls.

## Installation and operation

The package exports `plugin` and `messages` for the board manifest. It depends
only on the plugin kit and shared UI. Run migrations when installing it.

The [Awards guide](../../docs/guides/community/awards-guide.md) covers setup,
visibility, icons, notifications, caching and version-one limits.

## What it stores

One migration creates awards, grants, rules, a dirty-member queue and a scan
cursor, all under `plugin_awards_*`. Foreign keys remain inside that namespace;
member ids are plain columns. Account deletion removes grants; account merging
preserves recognition while collapsing single-only and same-rule duplicates.

## Automatic rules

Administrators can combine minimum posts, threads, reputation and registration
age. A five-minute task drains queued changes and scans existing members in
bounded, resumable batches. Its rule/member unique index prevents duplicate
awards from repeated runs. The public catalogue describes how awards are earned.
See the guide for progress controls, revocation behaviour and failure recovery.
