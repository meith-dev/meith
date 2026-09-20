# Plugin storage and membership

Use runtime repositories instead of importing the board's database connection. Plugins run in-process; database restrictions do not sandbox arbitrary plugin code.

## Namespaces

| Resource | Namespace |
|---|---|
| Settings | `plugin.<key>.*`; `_enabled` is reserved |
| Tables | `plugin_<key>_`; hyphens in the key become underscores |

Keep ordered migrations in the plugin definition, with IDs such as `0001_create_entries`. Migrations run forward only. Never edit an applied migration. Store core identifiers as values rather than declaring foreign keys into core tables.

## Queries and transactions

Use parameterized `query`, `one` and `tx` calls. Nested transactions join the current transaction. Runtime SQL uses a statement timeout and a database role limited to the plugin's tables and sequences. It cannot access core/other-plugin tables or run DDL.

The database login must be able to provision the plugin roles, or an operator must pre-create them. Test migrations and permission boundaries against PostgreSQL before release.

## User lookup

| Service | Result |
|---|---|
| `byId`, `byUsername` | Minimal user identity; deleted or missing users return `null` |
| `standing` | Public counts and registration dates for at most 200 users |
| `scan` | ID-cursor pagination; limit clamped to 0–200 |

These services do not expose account secrets or arbitrary database rows.

## Group grants

The grants service supports `grant`, `extend`, `revoke`, `list` and `holds`. A grant requires a nonempty reason and a future expiry no more than two years away.

An administrator must opt an ordinary group into plugin grants. Power groups are refused. Plugins can manage only their own grants.

| Operation | Constraint |
|---|---|
| Grant secondary membership | Default behaviour |
| Grant primary membership | Set `primary: true`; preserve the prior primary group; never displace staff privileges |
| Extend | Move expiry forward only |
| List | Returns grants owned by this plugin |
| Holds | Returns false for missing or unapproved groups |

Expired grants stop authorizing access on read even if the scheduler is stopped. The `groups.expire` task cleans up persisted membership. Test expiry, retries and overlapping membership before using grants for paid access.
