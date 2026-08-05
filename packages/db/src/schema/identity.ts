/**
 * R3.1 Identity: `usergroups`, `users`, `user_group_memberships`, `sessions`,
 * `remember_tokens`, `login_attempts`, `bans`, `ban_filters`.
 *
 * Naming follows R3.1 exactly (`username_lower`, `password_algo`, …) so the
 * MyBB importer in a later phase has no translation layer to get wrong.
 *
 * Integer surrogate keys throughout, not UUIDs. R4.3 types `visibleForumIds()`
 * as `Promise<number[]>`, and at the F12 target of 2M posts a 4-byte key versus
 * a 16-byte one is a materially smaller index on `posts (thread_id, id)` — the
 * hottest index on the board.
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { groupPermissionColumns } from './permission-columns'

/**
 * Usergroups carry the global permission defaults — R4.1 layer 1.
 *
 * The seven default groups (F15) are seeded by migration, never inserted ad
 * hoc, so a fresh database and a migrated one are identical.
 */
export const usergroups = pgTable(
  'usergroups',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    /** Stable machine name. Migrations and seeds key off this, not the title. */
    key: text('key').notNull(),
    title: text('title').notNull(),
    description: text('description'),

    /**
     * Presentation for the group badge (F33). Stored as a token *name* from the
     * R7 set, never a colour literal, so a theme override can restyle it.
     */
    badgeToken: text('badge_token'),

    /** Sort order in the ACP and in "staff" listings. */
    displayOrder: integer('display_order').notNull().default(0),

    /**
     * A system group cannot be deleted, because the code references it by key
     * (guests, registered, banned). User-created groups can be.
     */
    isSystem: boolean('is_system').notNull().default(false),

    /** Show members of this group on the staff / "who's online" legend. */
    isStaffGroup: boolean('is_staff_group').notNull().default(false),

    /** All ~45 permission defaults, generated from the @meith/core registry. */
    ...groupPermissionColumns(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('usergroups_key_key').on(t.key),
    index('usergroups_display_order_idx').on(t.displayOrder),
  ],
)

/**
 * Account states. `state` rather than a pile of booleans: the states are
 * mutually exclusive and a boolean soup permits nonsense like
 * banned + awaiting-activation at once.
 *
 * - `active`              — normal.
 * - `awaiting_activation` — registered, email unverified (F18 email mode).
 * - `awaiting_approval`   — registered, needs an admin (F18 approval mode).
 * - `banned`              — see `bans` for the expiry and prior group.
 * - `deleted`             — soft-deleted; rows retained so post attribution and
 *                           thread counts stay coherent.
 */
export const USER_STATES = [
  'active',
  'awaiting_activation',
  'awaiting_approval',
  'banned',
  'deleted',
] as const

export const users = pgTable(
  'users',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    username: text('username').notNull(),
    /**
     * Lowercased username carrying the UNIQUE index (R3.1). Enforcing
     * case-insensitive uniqueness in application code instead loses the race
     * between two concurrent registrations, which is precisely F18's acceptance
     * criterion "duplicate username differing only by case is rejected".
     */
    usernameLower: text('username_lower').notNull(),

    email: text('email').notNull(),
    emailLower: text('email_lower').notNull(),

    /**
     * Argon2id PHC string (F17). Nullable: an imported or SSO account may have
     * no local password.
     */
    passwordHash: text('password_hash'),
    /**
     * Which algorithm produced `password_hash`. Drives the upgrade-on-login
     * path (F17) — a legacy `mybb_md5` hash is verified with the old scheme once,
     * then silently rehashed to Argon2id on successful login.
     */
    passwordAlgo: text('password_algo'),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),

    /** R4.1 layer 1: the group whose permissions apply by default. */
    primaryGroupId: integer('primary_group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'restrict' }),
    /**
     * The group whose badge/title is *shown*. Separate from primary because a
     * user may be promoted for permissions while keeping a cosmetic title.
     */
    displayGroupId: integer('display_group_id').references(() => usergroups.id, {
      onDelete: 'set null',
    }),

    state: text('state').notNull().default('active'),

    /** Denormalised counters, maintained by outbox consumers (F06). */
    postCount: integer('post_count').notNull().default(0),
    threadCount: integer('thread_count').notNull().default(0),
    reputation: integer('reputation').notNull().default(0),
    warningPoints: smallint('warning_points').notNull().default(0),

    /*
     * F58's signature. Raw Markdown plus F36's render pair, for the third time
     * (`posts`, `private_messages`, now here) — a signature is member-written
     * markup under every one of their posts, so a renderer security fix has to
     * reach it the same way it reaches everything else.
     */
    signature: text('signature').notNull().default(''),
    signatureHtml: text('signature_html'),
    signatureRenderVersion: smallint('signature_render_version').notNull().default(0),
    /** `BodyFormat`; see `posts.bodyFormat`. */
    signatureFormat: smallint('signature_format').notNull().default(1),
    /** Locked by a moderator: kept, not rendered, not editable. */
    signatureLocked: boolean('signature_locked').notNull().default(false),
    signatureLockedReason: text('signature_locked_reason'),

    /*
     * F58's other half. The two keys are F42's lifecycle: `avatarSourceKey`
     * holds what the member uploaded and `avatarKey` what the board serves,
     * written by an encoder from decoded pixels. `none` is a real state and the
     * commonest, so it is a value rather than a null every query coalesces.
     */
    avatarStatus: text('avatar_status').notNull().default('none'),
    avatarKey: text('avatar_key'),
    avatarSourceKey: text('avatar_source_key'),
    avatarWidth: integer('avatar_width'),
    avatarHeight: integer('avatar_height'),
    avatarFailureReason: text('avatar_failure_reason'),
    /** Part of the served URL, so a replacement is never a cached old image. */
    avatarUpdatedAt: timestamp('avatar_updated_at', { withTimezone: true }),
    avatarLocked: boolean('avatar_locked').notNull().default(false),
    avatarLockedReason: text('avatar_locked_reason'),

    /** Truncated per F09 — never a full address. */
    registrationIpPrefix: text('registration_ip_prefix'),
    lastIpPrefix: text('last_ip_prefix'),

    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    /**
     * F53's two warning-level restrictions.
     *
     * Columns rather than a `user_restrictions` table because there is at most
     * one of each per member and the posting path needs both on every post — a
     * join for a row that is almost always absent, on the board's hottest
     * write. NULL means no restriction, and a timestamp in the past is one that
     * has lapsed: nothing has to be swept for these to be correct.
     */
    suspendedPostingUntil: timestamp('suspended_posting_until', { withTimezone: true }),
    moderatedPostingUntil: timestamp('moderated_posting_until', { withTimezone: true }),

    /**
     * F57 — the member's own settings.
     *
     * Columns rather than a `user_preferences` table for F53's reason: every
     * one is read on the page-render path for the signed-in member, there is
     * exactly one of each per account, and a join for a row that always exists
     * is a join on every page of the board.
     */
    /** IANA name, validated against the runtime's tz database. Never an offset. */
    timezone: text('timezone').notNull().default('UTC'),
    /** Null = the board setting. Override-only, like `settings` itself. */
    postsPerPage: smallint('posts_per_page'),
    threadsPerPage: smallint('threads_per_page'),
    /**
     * F75 — browse without appearing in the online list.
     *
     * Beside the other F57 preferences and for the same reason: it is read on
     * every render of the online panel for every listed member, and a join for
     * a row that always exists is a join on every page that shows the list.
     *
     * It hides the member from the list *and from the count*, for everyone but
     * staff. Hiding them from the list alone would make invisibility a puzzle
     * anybody can solve by subtraction — "eleven online, ten listed" names an
     * invisible member as surely as printing their name.
     */
    invisible: boolean('invisible').notNull().default(false),

    /** The public profile a member writes about themselves. */
    location: text('location'),
    website: text('website'),
    bio: text('bio'),

    /** Set when state='deleted'. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    /** Provenance for the MyBB importer; unique when present. */
    legacyMybbUid: integer('legacy_mybb_uid'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('users_username_lower_key').on(t.usernameLower),
    uniqueIndex('users_email_lower_key').on(t.emailLower),
    uniqueIndex('users_legacy_mybb_uid_key')
      .on(t.legacyMybbUid)
      .where(sql`${t.legacyMybbUid} is not null`),
    index('users_primary_group_idx').on(t.primaryGroupId),
    // Member list default ordering, active accounts only.
    index('users_active_created_idx')
      .on(t.createdAt)
      .where(sql`${t.state} = 'active'`),
    // "Who's online" and the last-active column.
    index('users_last_active_idx').on(t.lastActiveAt),
    /* F36's backfill predicate for signatures; partial, because most rows have
       no signature at all and the task must not scan them. */
    index('users_signature_render_version_idx')
      .on(t.signatureRenderVersion, t.id)
      .where(sql`${t.signature} <> ''`),
  ],
)

/**
 * Secondary group memberships (F15). A user holds one primary group via
 * `users.primary_group_id` and any number of secondary groups here.
 *
 * `isDisplayGroup` is the display-group flag F15 asks for; it is advisory,
 * because `users.display_group_id` is the authoritative pointer. Keeping the
 * flag lets the ACP show "display" against a membership row without a join back.
 */
export const userGroupMemberships = pgTable(
  'user_group_memberships',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'cascade' }),

    isDisplayGroup: boolean('is_display_group').notNull().default(false),

    /** Who added them, for the audit trail. Null = automatic promotion. */
    grantedByUserId: integer('granted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Composite PK: a user cannot be in the same group twice.
    uniqueIndex('user_group_memberships_pkey').on(t.userId, t.groupId),
    // Resolving an actor reads every membership for one user.
    index('user_group_memberships_user_idx').on(t.userId),
    // "List members of this group" in the ACP.
    index('user_group_memberships_group_idx').on(t.groupId),
  ],
)

/**
 * Server-side sessions (F17). The cookie carries an opaque random token; only
 * its SHA-256 is stored, so a database dump does not hand out live sessions.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    tokenHash: text('token_hash').notNull(),

    /** Null for guest sessions, which exist to hold flash messages and CSRF. */
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),

    /** R3.1 `sessions.location_*`, updated at most once per 60s (F17). */
    locationPath: text('location_path'),
    locationForumId: integer('location_forum_id'),
    locationThreadId: integer('location_thread_id'),

    ipPrefix: text('ip_prefix'),
    userAgent: text('user_agent'),

    /**
     * Session fixation defence (F17): on login the old row is marked superseded
     * and points at its replacement, giving in-flight requests a grace window
     * instead of an abrupt logout.
     */
    supersededBySessionId: integer('superseded_by_session_id'),

    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    // R3.5 requires this one by name: drives "who's online" and the reaper.
    index('sessions_last_seen_idx').on(t.lastSeenAt),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
)

/**
 * Remember-me tokens (F17), with rotation and reuse detection.
 *
 * Tokens form a *family*: each rotation supersedes the previous token. If a
 * token that has already been rotated is presented again, it was stolen — and
 * the correct response is to revoke the entire family, not just that token.
 * `familyId` and `usedAt` are what make that detectable.
 */
export const rememberTokens = pgTable(
  'remember_tokens',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    tokenHash: text('token_hash').notNull(),

    /** Shared by every token descended from one original login. */
    familyId: text('family_id').notNull(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Non-null once rotated. Presenting a used token triggers family revocation. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Set on every token in the family when reuse is detected. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('remember_tokens_hash_key').on(t.tokenHash),
    index('remember_tokens_family_idx').on(t.familyId),
    index('remember_tokens_user_idx').on(t.userId),
    index('remember_tokens_expires_idx').on(t.expiresAt),
  ],
)

/**
 * Login throttling ledger (F19), deliberately in Postgres rather than only in
 * the KV driver: if lockout lived in the cache, flushing the cache would reset
 * an attacker's budget.
 */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    /**
     * Throttle bucket. Two buckets are recorded per attempt — one keyed by
     * identifier, one by IP prefix — so neither a single account nor a single
     * host can be used to lock out everyone else.
     */
    bucket: text('bucket').notNull(),
    succeeded: boolean('succeeded').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('login_attempts_bucket_idx').on(t.bucket, t.occurredAt)],
)

/**
 * Single-use, expiring credential tokens: password reset (F19), email
 * verification (F18), and email change.
 *
 * One table, because the security properties are identical — hashed at rest,
 * single-use via `consumed_at`, short-lived, revocable in bulk per user — and
 * three copies of those properties would drift.
 */
export const credentialTokens = pgTable(
  'credential_tokens',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    tokenHash: text('token_hash').notNull(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** 'password_reset' | 'email_verification' | 'email_change' */
    purpose: text('purpose').notNull(),
    /** For 'email_change', the pending address. */
    payload: text('payload'),

    /** Non-null once redeemed — this is what makes replay impossible (F19). */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('credential_tokens_hash_key').on(t.tokenHash),
    index('credential_tokens_user_purpose_idx').on(t.userId, t.purpose),
    index('credential_tokens_expires_idx').on(t.expiresAt),
  ],
)

/**
 * Bans (F23). Temporary and permanent, restoring the prior group on expiry —
 * which is why `previousPrimaryGroupId` is stored rather than inferred.
 */
export const bans = pgTable(
  'bans',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    bannedByUserId: integer('banned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    reason: text('reason'),
    /** Shown to the banned user; the reason may be staff-only. */
    publicReason: text('public_reason'),

    /** Restored by the expire-bans task (R9). */
    previousPrimaryGroupId: integer('previous_primary_group_id').references(
      () => usergroups.id,
      { onDelete: 'set null' },
    ),

    /** Null = permanent. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // At most one active ban per user.
    uniqueIndex('bans_active_user_key')
      .on(t.userId)
      .where(sql`${t.liftedAt} is null`),
    // The expire-bans task scans this.
    index('bans_expires_idx')
      .on(t.expiresAt)
      .where(sql`${t.liftedAt} is null`),
  ],
)

/**
 * Ban filters (F23): patterns blocked at registration and login.
 * `type` is 'username' | 'email' | 'ip'.
 */
export const banFilters = pgTable(
  'ban_filters',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    type: text('type').notNull(),
    /** Glob-style pattern, e.g. `*@spam.example`. Matched case-insensitively. */
    pattern: text('pattern').notNull(),
    note: text('note'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ban_filters_type_idx').on(t.type),
    uniqueIndex('ban_filters_type_pattern_key').on(t.type, t.pattern),
  ],
)


/**
 * F24 — automatic group promotion rules.
 *
 * Every criterion column is nullable and means "no constraint" when null, so a
 * rule can say "everyone in this group" without sentinel thresholds that would
 * need special-casing at each read. The safety rules — never lift a ban, never
 * demote, never re-apply — live in `@meith/groups`, not here: they are policy,
 * and the database cannot express "is this a demotion" without knowing the
 * group ladder's ranking.
 */
export const groupPromotions = pgTable(
  'group_promotions',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    title: text('title').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** Evaluation order; the first matching rule wins, so this is policy. */
    displayOrder: integer('display_order').notNull().default(0),

    minPostCount: integer('min_post_count'),
    minReputation: integer('min_reputation'),
    minDaysRegistered: integer('min_days_registered'),

    /** Null = any group. */
    fromPrimaryGroupId: integer('from_primary_group_id').references(() => usergroups.id, {
      onDelete: 'cascade',
    }),
    toPrimaryGroupId: integer('to_primary_group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('group_promotions_order_idx').on(t.displayOrder, t.id)],
)

/* ------------------------------------------------------------------ *
 * F53 — warnings
 * ------------------------------------------------------------------ */

/** The reusable reasons a moderator picks from. */
export const warningTypes = pgTable(
  'warning_types',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    title: text('title').notNull(),
    points: smallint('points').notNull().default(1),
    /** Null = never expires. Not 0, which reads as "expires immediately". */
    expiryDays: integer('expiry_days'),
    isActive: boolean('is_active').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('warning_types_order_idx').on(t.displayOrder, t.id)],
)

/**
 * What happens at a points threshold.
 *
 * Thresholds, not steps: the level that applies is the highest-pointed one the
 * member has reached, re-evaluated from the recomputed total after every change.
 * That is what makes a revocation lift a restriction rather than only lower a
 * number.
 */
export const warningLevels = pgTable(
  'warning_levels',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    points: smallint('points').notNull(),
    /** 'suspend_posting' | 'moderate_posting' | 'ban'. */
    action: text('action').notNull(),
    /** Null = for as long as the member is at this level. */
    durationDays: integer('duration_days'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('warning_levels_points_unique').on(t.points)],
)

/**
 * One issued warning — the record. `users.warning_points` is a cache of it.
 *
 * `title` and `points` are copied from the type at issue time, because a
 * member's history is a record of what they were told rather than a view over
 * whatever the configuration says today.
 */
export const warnings = pgTable(
  'warnings',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuedByUserId: integer('issued_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    typeId: integer('type_id').references(() => warningTypes.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    points: smallint('points').notNull(),
    reason: text('reason').notNull().default(''),

    /** What it was about, when it was about something. */
    postId: integer('post_id'),
    reportId: integer('report_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null = never expires. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    /**
     * Revocation is a column pair rather than a deletion: "this was withdrawn"
     * is information a member is entitled to, and a deleted row cannot say a
     * mistake was corrected.
     */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: integer('revoked_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokeReason: text('revoke_reason'),
  },
  (t) => [index('warnings_user_idx').on(t.userId, t.createdAt, t.id)],
)

/* ------------------------------------------------------------------ *
 * F55 — notifications
 * ------------------------------------------------------------------ */

/**
 * One thing a member has been told.
 *
 * `data` holds the facts captured when it was raised, and the wording is
 * applied on read by `@meith/notifications`. Storing a pointer instead — a post
 * id read back at render time — breaks in the case notifications exist for: the
 * post is often the one a moderator has since deleted, so the record would
 * either vanish or quietly say something different.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** A registry id. Text, so a removed kind still reads back. */
    kind: text('kind').notNull(),
    data: jsonb('data').notNull().default({}),
    /** Board-relative path, or null for a notification pointing nowhere. */
    href: text('href'),

    /**
     * Coalescing identity. Null never coalesces; a non-null key is unique per
     * member *while unread*, which is what turns a task failing every minute
     * into one row and a count.
     */
    dedupeKey: text('dedupe_key'),
    occurrences: integer('occurrences').notNull().default(1),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Bumped when a raise coalesces into this row. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Written after a message goes out, so a queue retry does not send twice. */
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    /*
     * The unread count renders in the user panel on every page for a signed-in
     * member, so it must not pay for the history: partial, over the rows that
     * can contribute.
     */
    index('notifications_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    /*
     * Coalescing, enforced rather than checked. Partial on unread *and* on a
     * non-null key: a read notification no longer blocks a fresh one, and a row
     * that opted out of coalescing is not constrained at all.
     */
    uniqueIndex('notifications_dedupe_idx')
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.readAt} is null and ${t.dedupeKey} is not null`),
  ],
)

/**
 * Which kinds a member wants by e-mail.
 *
 * Overrides only, like `settings`: absence means the registry default, which is
 * what lets a kind added in a later deploy arrive switched on rather than
 * switched off for everybody who ever opened the screen. There is no on-site
 * column on purpose — the centre is the record, and a record somebody can
 * disable is not one.
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    email: boolean('email').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'notification_preferences_pkey', columns: [t.userId, t.kind] }),
  ],
)

/* ------------------------------------------------------------------ *
 * F59 — custom profile fields
 * ------------------------------------------------------------------ */

/**
 * A field the operator defines, in the shape F57's fixed trio could not have.
 *
 * `key` is the stable machine name, so renaming a label keeps every stored
 * answer attached. `type` is text rather than an enum for the reason
 * `visibility` is: a type this build does not know must degrade to a plain
 * input rather than break the profile screen.
 */
export const profileFields = pgTable(
  'profile_fields',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),

    /** 'text' | 'textarea' | 'select' | 'checkbox' | 'url' | 'number'. */
    type: text('type').notNull().default('text'),
    /** The choices, for `select`. A JSON array of strings; empty otherwise. */
    options: jsonb('options').notNull().default([]),
    /** Null = the type's own default. */
    maxLength: integer('max_length'),

    displayOrder: integer('display_order').notNull().default(0),
    /** Inactive keeps the values: "hide this for now" is not "delete it". */
    isActive: boolean('is_active').notNull().default(true),
    /** Asked on the registration form, and refused if empty (F18). */
    requiredAtRegistration: boolean('required_at_registration').notNull().default(false),

    /**
     * What applies when no group row says otherwise. Two booleans rather than
     * one visibility word, because "who may see it" and "who may change it" are
     * genuinely independent.
     */
    defaultVisible: boolean('default_visible').notNull().default(true),
    defaultEditable: boolean('default_editable').notNull().default(true),

    /** Beside every post as well as on the profile. Off by default (F31's cost). */
    showInPostbit: boolean('show_in_postbit').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('profile_fields_key_unique').on(t.key),
    index('profile_fields_order_idx').on(t.displayOrder, t.id),
  ],
)

/**
 * The per-group override, in F21's `forum_permissions` shape.
 *
 * Nullable columns, where NULL means "inherit the field's default" — which is
 * what makes "staff may edit this" one row rather than a row per group with the
 * other answer copied in. Resolution is R4.2's: any group granting is a grant.
 */
export const profileFieldGroups = pgTable(
  'profile_field_groups',
  {
    fieldId: integer('field_id')
      .notNull()
      .references(() => profileFields.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'cascade' }),
    canView: boolean('can_view'),
    canEdit: boolean('can_edit'),
  },
  (t) => [
    primaryKey({ name: 'profile_field_groups_pkey', columns: [t.fieldId, t.groupId] }),
  ],
)

/**
 * One member's answer to one field.
 *
 * A row exists only once somebody answers, so an unanswered field costs
 * nothing — which matters when a board with twelve fields has ten thousand
 * members who filled in two.
 */
export const profileFieldValues = pgTable(
  'profile_field_values',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fieldId: integer('field_id')
      .notNull()
      .references(() => profileFields.id, { onDelete: 'cascade' }),
    value: text('value').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'profile_field_values_pkey', columns: [t.userId, t.fieldId] }),
    index('profile_field_values_user_idx').on(t.userId),
  ],
)

/**
 * Buddy and ignore lists (F61).
 *
 * One table with a `kind` rather than two, because the two are mutually
 * exclusive and one row per ordered pair makes that the primary key. The pair
 * is ordered: (me, them) is my opinion of them and says nothing about theirs of
 * me — ignoring is deliberately not symmetric.
 */
export const userRelations = pgTable(
  'user_relations',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    otherUserId: integer('other_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'buddy' | 'ignore'. */
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'user_relations_pkey', columns: [t.userId, t.otherUserId] }),
    index('user_relations_kind_idx').on(t.userId, t.kind, t.otherUserId),
    /* The reverse direction: "does this recipient ignore the sender" (F60). */
    index('user_relations_reverse_idx').on(t.otherUserId, t.kind),
  ],
)

/**
 * The ACP's own session (F63).
 *
 * A second session, not a second account: entering `/admin` asks for the
 * password again and mints this, with a short idle timeout that can be
 * aggressive precisely because expiring it logs somebody out of the ACP and
 * nothing else.
 *
 * `authenticatedAt` is a separate clock from `lastSeenAt`. Activity extends the
 * session; only re-entering the password moves the proof — which is what
 * "re-authenticate before this destructive operation" reads.
 */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the cookie value; never the value itself. */
    tokenHash: text('token_hash').notNull(),
    /** Truncated per F09 — never a full address. */
    ipPrefix: text('ip_prefix'),
    authenticatedAt: timestamp('authenticated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('admin_sessions_token_hash_key').on(t.tokenHash),
    index('admin_sessions_user_idx').on(t.userId),
    index('admin_sessions_expiry_idx').on(t.expiresAt),
  ],
)
