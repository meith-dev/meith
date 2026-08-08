/**
 * `@meith/import` — the MyBB import (F85).
 *
 * A source **port**, the mapping, and a chunked resumable runner. Reading a live
 * MyBB board means a MySQL client, which is a runtime dependency the roadmap's
 * working rules say to stop for a human on — so what ships is the interface, a
 * fixture implementation, and every decision that is not "connect to MySQL".
 *
 * That is where the difficulty actually is. The acceptance criterion asks for a
 * fixture round trip precisely because a reader is
 * `SELECT * FROM mybb_posts WHERE pid > ? LIMIT ?`, and the mapping, the
 * ordering, the resumability and the counter comparison are not.
 */

export {
  FixtureMybbSource,
  type MybbCommunity,
  type MybbPost,
  type MybbSource,
  type MybbThread,
  type MybbUser,
  type Page,
} from './source'

/* The MySQL reader, loaded dynamically — see `mysql-source.ts`. */
export {
  assertSafePrefix,
  MysqlMybbSource,
  type MysqlSourceOptions,
} from './mysql-source'

export {
  fromUnixSeconds,
  mapCommunity,
  mapPost,
  mapThread,
  mapUser,
  visibilityOf,
  type ImportedCommunity,
  type ImportedPost,
  type ImportedThread,
  type ImportedUser,
  type Visibility,
} from './map'

export {
  KINDS,
  NO_PROGRESS,
  compareCounters,
  runImport,
  type CounterComparison,
  type Cursors,
  type ImportReport,
  type ImportSink,
  type Kind,
  type KindReport,
  type RunOptions,
  type WriteResult,
} from './run'

/* F86 — the MyBB URL table. Here rather than in its own package because it is
 * the same compatibility concern as the import and reads the map the import
 * writes: `legacy_ids`. */
export {
  legacyRedirectPath,
  resolveLegacyUrl,
  type LegacyTarget,
} from './legacy-urls'
