/**
 * Every column in the schema that points at a user, and what a merge does with
 * it.
 *
 * This file is a *declaration*, deliberately separated from the SQL that acts
 * on it, because the dangerous failure of an account merge is not a wrong
 * update — it is a **column nobody remembered**. A missed column leaves rows
 * pointing at an account that has been merged away: posts with no author on the
 * screen, a warning attached to nobody, a subscription that never fires again.
 * None of that raises an error, and none of it is noticed for months.
 *
 * So the map is enumerable, and a test compares it against
 * `information_schema` — every column named like a user reference must appear
 * in exactly one list. A migration that adds one fails the suite until somebody
 * decides which list it belongs to, which is the only version of this that
 * survives the next twenty features.
 *
 * Five lists, because there are five genuinely different answers — and one of
 * them is "this is not a reference at all", which had to exist the moment a
 * column called `last_user_id` turned out to be a cursor.
 */

/** A plain pointer: the winner simply inherits it. */
export interface ReassignColumn {
  readonly table: string
  readonly column: string
}

/**
 * A per-user row under a uniqueness rule.
 *
 * Both accounts may hold a row for the same thing — both subscribed to the same
 * thread, both in the same group — and a straight UPDATE violates the index. The
 * loser's duplicate is dropped and the rest move: the winner keeps what they
 * had, which is the answer that loses no information the winner did not already
 * have.
 */
export interface DedupeColumn extends ReassignColumn {
  /** The other columns of the uniqueness rule. */
  readonly keys: readonly string[]
  /** The index's predicate, for the partial ones. */
  readonly where?: string
}

/**
 * Rows that must be **destroyed** rather than moved.
 *
 * Every one of these is a credential. Moving the loser's session to the winner
 * would hand the winner's account to whoever holds that cookie — an account
 * merge is not an authentication event, and treating a session like content is
 * how a housekeeping operation becomes a takeover.
 */
export type DiscardColumn = ReassignColumn

export const MERGE_REASSIGN: readonly ReassignColumn[] = [
  { table: 'admin_log', column: 'user_id' },
  { table: 'attachments', column: 'uploader_user_id' },
  { table: 'ban_filters', column: 'created_by_user_id' },
  { table: 'bans', column: 'banned_by_user_id' },
  { table: 'bans', column: 'user_id' },
  /* Denormalised display columns. Missing these leaves the old name on screen. */
  { table: 'forums', column: 'last_post_user_id' },
  { table: 'threads', column: 'last_post_user_id' },
  { table: 'post_revisions', column: 'edited_by_user_id' },
  { table: 'posts', column: 'author_user_id' },
  { table: 'posts', column: 'edited_by_user_id' },
  { table: 'private_messages', column: 'author_user_id' },
  { table: 'report_events', column: 'actor_user_id' },
  { table: 'reports', column: 'assigned_to_user_id' },
  { table: 'reports', column: 'resolved_by_user_id' },
  { table: 'settings', column: 'updated_by_user_id' },
  { table: 'threads', column: 'author_user_id' },
  { table: 'mass_mails', column: 'created_by_user_id' },
  /*
   * F75's rollup output. The next run recomputes it, so reassigning changes
   * nothing five minutes later — but the five minutes matter: it is the board's
   * front page, and it would spend them announcing an account that no longer
   * exists.
   */
  { table: 'board_stats', column: 'newest_user_id' },
  { table: 'user_group_memberships', column: 'granted_by_user_id' },
  { table: 'warnings', column: 'issued_by_user_id' },
  { table: 'warnings', column: 'revoked_by_user_id' },
  { table: 'warnings', column: 'user_id' },
]

export const MERGE_DEDUPE: readonly DedupeColumn[] = [
  { table: 'digest_runs', column: 'user_id', keys: ['cadence'] },
  { table: 'forum_moderators', column: 'user_id', keys: ['forum_id'] },
  { table: 'forum_subscriptions', column: 'user_id', keys: ['forum_id'] },
  { table: 'forums_read', column: 'user_id', keys: ['forum_id'] },
  {
    table: 'notifications',
    column: 'user_id',
    keys: ['dedupe_key'],
    where: 'read_at is null and dedupe_key is not null',
  },
  { table: 'notification_preferences', column: 'user_id', keys: ['kind'] },
  { table: 'private_message_copies', column: 'owner_user_id', keys: ['message_id'] },
  { table: 'profile_field_values', column: 'user_id', keys: ['field_id'] },
  {
    table: 'reports',
    column: 'reporter_user_id',
    keys: ['target_kind', 'target_id'],
    where: "status = 'open'",
  },
  { table: 'thread_subscriptions', column: 'user_id', keys: ['thread_id'] },
  { table: 'threads_read', column: 'user_id', keys: ['thread_id'] },
  { table: 'user_group_memberships', column: 'user_id', keys: ['group_id'] },
]

export const MERGE_DISCARD: readonly DiscardColumn[] = [
  { table: 'admin_sessions', column: 'user_id' },
  /*
   * F73's stored searches. Not a credential like the rest of this list, but
   * discarded for a related reason: a stored search is a record of *what
   * somebody typed*, it is pruned on a schedule anyway, and the winner loses
   * nothing by searching again. Reassigning would hand one person's search
   * terms to another account — and a merge is routinely used on a duplicate
   * somebody else created.
   */
  { table: 'searches', column: 'user_id' },
  { table: 'credential_tokens', column: 'user_id' },
  { table: 'remember_tokens', column: 'user_id' },
  { table: 'sessions', column: 'user_id' },
]

/**
 * Columns the generic machinery cannot handle, listed so the coverage test can
 * account for them.
 *
 * `reputation` and `user_relations` are both **two-ended**: the merge can bring
 * the two ends together and produce a row that was never possible to create —
 * somebody rating themselves, somebody on their own ignore list. A generic
 * dedupe would move them happily and leave the board in a state its own
 * validation rejects. See `mergeBespoke` in `user-merge-repo.ts`.
 */
export const MERGE_BESPOKE: readonly ReassignColumn[] = [
  { table: 'reputation', column: 'given_by_user_id' },
  { table: 'reputation', column: 'user_id' },
  { table: 'user_relations', column: 'other_user_id' },
  { table: 'user_relations', column: 'user_id' },
]

/**
 * Denormalised *names*, which are a second kind of pointer entirely.
 *
 * `posts.author_username` and its four siblings hold the name rather than the
 * id, so reassigning `author_user_id` and stopping there leaves every post
 * still displaying the merged-away name — with no foreign key, no error, and
 * nothing to notice. They are NOT NULL, which is how the schema-driven coverage
 * test found them: the first version of this map had none of them.
 *
 * Each names the id column it travels with, because the rename has to follow
 * the same rows the reassignment moved.
 */
export interface RenameColumn {
  readonly table: string
  /** The denormalised name column. */
  readonly column: string
  /** The id column on the same row that says whose name it is. */
  readonly idColumn: string
}

export const MERGE_RENAME: readonly RenameColumn[] = [
  { table: 'board_stats', column: 'newest_username', idColumn: 'newest_user_id' },
  { table: 'forums', column: 'last_post_username', idColumn: 'last_post_user_id' },
  { table: 'posts', column: 'author_username', idColumn: 'author_user_id' },
  { table: 'private_messages', column: 'author_username', idColumn: 'author_user_id' },
  { table: 'threads', column: 'author_username', idColumn: 'author_user_id' },
  { table: 'threads', column: 'last_post_username', idColumn: 'last_post_user_id' },
]

/**
 * Columns whose name looks like a user reference and which are **not** one.
 *
 * There is exactly one so far, and it is worth the escape hatch existing:
 * `mass_mails.last_user_id` is a *cursor* — the position a campaign's send
 * reached in an ordering of recipients — not a pointer to a member. Reassigning
 * it would fix nothing and would corrupt the resume point of a run in progress,
 * mailing part of the board twice.
 *
 * The temptation on finding this was to rename the column until the coverage
 * test stopped noticing it. That is exactly how a guard becomes useless:
 * renaming to dodge a check teaches the next person that the check is an
 * obstacle. Naming it here costs one line, keeps the guard honest, and — since
 * the test also asserts the lists are disjoint — leaves the decision on the
 * record rather than as an omission.
 */
export const MERGE_NOT_A_REFERENCE: readonly ReassignColumn[] = [
  { table: 'mass_mails', column: 'last_user_id' },
]

/**
 * Every column the map accounts for, for the coverage test.
 *
 * `users.username` and `users.username_lower` are excluded: they are the
 * account's own identity rather than a reference to it, and a merge leaves the
 * losing account's name alone deliberately (see `finish`).
 */
export function mergeMapColumns(): readonly string[] {
  return [
    ...MERGE_REASSIGN,
    ...MERGE_DEDUPE,
    ...MERGE_DISCARD,
    ...MERGE_BESPOKE,
    ...MERGE_RENAME,
    ...MERGE_NOT_A_REFERENCE,
  ]
    .map((entry) => `${entry.table}.${entry.column}`)
    .sort()
}
