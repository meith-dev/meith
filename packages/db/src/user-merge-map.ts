import { DENORMALISED_USERNAME_COLUMNS } from './denormalised-username'

export interface ReassignColumn {
  readonly table: string
  readonly column: string
}

export interface DedupeColumn extends ReassignColumn {
  readonly keys: readonly string[]
  readonly where?: string
}

export type DiscardColumn = ReassignColumn

export const MERGE_REASSIGN: readonly ReassignColumn[] = [
  { table: 'admin_log', column: 'user_id' },
  { table: 'attachments', column: 'uploader_user_id' },
  { table: 'ban_filters', column: 'created_by_user_id' },
  { table: 'bans', column: 'banned_by_user_id' },
  { table: 'bans', column: 'user_id' },
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
  { table: 'announcements', column: 'author_user_id' },
  { table: 'board_stats', column: 'newest_user_id' },
  { table: 'user_group_memberships', column: 'granted_by_user_id' },
  { table: 'push_subscriptions', column: 'user_id' },
  { table: 'auth_events', column: 'user_id' },
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
  { table: 'poll_votes', column: 'user_id', keys: ['poll_id'] },
  { table: 'thread_ratings', column: 'user_id', keys: ['thread_id'] },
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

export const ACCOUNT_CLOSURE_DISCARD: readonly DiscardColumn[] = [
  { table: 'admin_sessions', column: 'user_id' },
  { table: 'user_two_factor', column: 'user_id' },
  { table: 'recovery_codes', column: 'user_id' },
  { table: 'api_tokens', column: 'user_id' },
  { table: 'credential_tokens', column: 'user_id' },
  { table: 'remember_tokens', column: 'user_id' },
  { table: 'sessions', column: 'user_id' },
  { table: 'user_identities', column: 'user_id' },
  { table: 'passkeys', column: 'user_id' },
]

export const MERGE_DISCARD: readonly DiscardColumn[] = [
  ...ACCOUNT_CLOSURE_DISCARD,
  { table: 'searches', column: 'user_id' },
  { table: 'post_drafts', column: 'user_id' },
]

export const MERGE_BESPOKE: readonly ReassignColumn[] = [
  { table: 'reputation', column: 'given_by_user_id' },
  { table: 'reputation', column: 'user_id' },
  { table: 'user_relations', column: 'other_user_id' },
  { table: 'user_relations', column: 'user_id' },
]

export const MERGE_NOT_A_REFERENCE: readonly ReassignColumn[] = [
  { table: 'mass_mails', column: 'last_user_id' },
]

export function mergeMapColumns(): readonly string[] {
  return [
    ...MERGE_REASSIGN,
    ...MERGE_DEDUPE,
    ...MERGE_DISCARD,
    ...MERGE_BESPOKE,
    ...DENORMALISED_USERNAME_COLUMNS,
    ...MERGE_NOT_A_REFERENCE,
  ]
    .map((entry) => `${entry.table}.${entry.column}`)
    .sort()
}
