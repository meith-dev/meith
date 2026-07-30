/**
 * F08 — the board settings registry.
 *
 * Every setting is declared here once, with its type, default, and validation.
 * The admin UI is *generated* from this list (F60), so adding a setting means
 * adding one entry — not an entry plus a form field plus a migration plus a
 * parser, each of which could disagree with the others.
 *
 * Values are stored as text in the `settings` table and coerced on read, which
 * is why each definition owns its own zod schema.
 */

import { z } from 'zod'

export type SettingGroup =
  | 'board'
  | 'registration'
  | 'posting'
  | 'display'
  | 'search'
  | 'mail'
  | 'security'

interface SettingDefinitionBase<T> {
  readonly key: string
  readonly group: SettingGroup
  readonly label: string
  readonly description: string
  readonly schema: z.ZodType<T>
  readonly default: T
  /**
   * Cache tags to invalidate when this setting changes. Wired to F10's registry
   * so a settings change cannot leave a stale rendered page behind.
   */
  readonly invalidates?: readonly string[]
  /**
   * When true the value is redacted in the admin UI and audit log. For secrets
   * that legitimately live in the database rather than the environment.
   */
  readonly secret?: boolean
}

export type SettingDefinition<T = unknown> = SettingDefinitionBase<T>

/** Helper preserving the literal value type through the definition. */
function define<T>(d: SettingDefinitionBase<T>): SettingDefinition<T> {
  return d
}

export const SETTING_DEFINITIONS = [
  /* ------------------------------- board ------------------------------- */
  define({
    key: 'board.name',
    group: 'board',
    label: 'Board name',
    description: 'Shown in the header, page titles, and outgoing e-mail.',
    schema: z.string().min(1).max(100),
    default: 'Forum',
    invalidates: ['settings', 'layout'],
  }),
  define({
    key: 'board.description',
    group: 'board',
    label: 'Board description',
    description: 'Used as the default meta description for the board index.',
    schema: z.string().max(300),
    default: '',
    invalidates: ['settings', 'layout'],
  }),
  define({
    key: 'board.offline',
    group: 'board',
    label: 'Board offline',
    description:
      'Closes the board to everyone without the "can view board offline" ' +
      'permission. Administrators keep access so they can finish maintenance.',
    schema: z.boolean(),
    default: false,
    invalidates: ['settings', 'layout'],
  }),
  define({
    key: 'board.offline_message',
    group: 'board',
    label: 'Offline message',
    description: 'Shown to visitors while the board is offline.',
    schema: z.string().max(2000),
    default: 'The board is temporarily unavailable for maintenance.',
    invalidates: ['settings'],
  }),

  /* ---------------------------- registration --------------------------- */
  define({
    key: 'registration.enabled',
    group: 'registration',
    label: 'Allow new registrations',
    description: 'When off, the registration form returns 403.',
    schema: z.boolean(),
    default: true,
    invalidates: ['settings'],
  }),
  define({
    key: 'registration.method',
    group: 'registration',
    label: 'Activation method',
    description:
      '"none" logs the user straight in. "email" requires a link. "admin" ' +
      'queues the account for manual approval. "both" requires e-mail then admin.',
    schema: z.enum(['none', 'email', 'admin', 'both']),
    default: 'email',
    invalidates: ['settings'],
  }),
  define({
    key: 'registration.min_password_length',
    group: 'registration',
    label: 'Minimum password length',
    description:
      'Applied to new passwords only. Raising it does not invalidate existing ' +
      'ones — those are rehashed on next login (see F17).',
    schema: z.number().int().min(8).max(128),
    default: 10,
  }),
  define({
    key: 'registration.username_min',
    group: 'registration',
    label: 'Minimum username length',
    description: 'Counted in Unicode code points, not bytes.',
    schema: z.number().int().min(1).max(64),
    default: 3,
  }),
  define({
    key: 'registration.username_max',
    group: 'registration',
    label: 'Maximum username length',
    description: 'Must not exceed the 64-character database column.',
    schema: z.number().int().min(1).max(64),
    default: 30,
  }),

  /* ------------------------------ posting ------------------------------ */
  define({
    key: 'posting.flood_seconds',
    group: 'posting',
    label: 'Post flood interval',
    description:
      'Minimum seconds between posts by one user. 0 disables the check. ' +
      'Users with "bypass flood check" are exempt.',
    schema: z.number().int().min(0).max(3600),
    default: 15,
  }),
  define({
    key: 'posting.max_length',
    group: 'posting',
    label: 'Maximum post length',
    description: 'Characters of source text, before rendering.',
    schema: z.number().int().min(100).max(200_000),
    default: 30_000,
  }),
  define({
    key: 'posting.edit_grace_seconds',
    group: 'posting',
    label: 'Silent edit window',
    description:
      'Edits within this window do not add an "edited by" notice. 0 always ' +
      'shows the notice.',
    schema: z.number().int().min(0).max(86_400),
    default: 300,
  }),

  /* ------------------------------ display ------------------------------ */
  define({
    key: 'display.threads_per_page',
    group: 'display',
    label: 'Threads per page',
    description: 'Capped to protect the forum-display query budget (F30).',
    schema: z.number().int().min(5).max(100),
    default: 25,
    invalidates: ['settings'],
  }),
  define({
    key: 'display.posts_per_page',
    group: 'display',
    label: 'Posts per page',
    description: 'Capped to protect the thread-view query budget (F31).',
    schema: z.number().int().min(5).max(100),
    default: 20,
    invalidates: ['settings'],
  }),
  define({
    key: 'display.default_theme_id',
    group: 'display',
    label: 'Default theme',
    description: 'Used for guests and users who have not chosen a theme.',
    schema: z.number().int().positive(),
    default: 1,
    invalidates: ['settings', 'theme', 'layout'],
  }),

  /* ------------------------------- search ------------------------------ */
  define({
    key: 'search.enabled',
    group: 'search',
    label: 'Enable search',
    description: 'Turning this off hides search UI and returns 403 from the route.',
    schema: z.boolean(),
    default: true,
    invalidates: ['settings'],
  }),
  define({
    key: 'search.flood_seconds',
    group: 'search',
    label: 'Search flood interval',
    description:
      'Minimum seconds between searches per user. Replaces the per-group ' +
      'searchfloodtime permission, which could not obey the numeric ' +
      'combination rule — see docs/mybb-parity.md.',
    schema: z.number().int().min(0).max(3600),
    default: 30,
  }),
  define({
    key: 'search.min_word_length',
    group: 'search',
    label: 'Minimum search term length',
    description: 'Shorter terms are dropped from the query.',
    schema: z.number().int().min(1).max(10),
    default: 3,
  }),

  /* -------------------------------- mail ------------------------------- */
  define({
    key: 'mail.from_name',
    group: 'mail',
    label: 'Sender name',
    description: 'Display name on outgoing mail. The address is MAIL_FROM (env).',
    schema: z.string().max(100),
    default: '',
  }),

  /* ------------------------------ security ----------------------------- */
  define({
    key: 'security.session_idle_days',
    group: 'security',
    label: 'Session idle timeout (days)',
    description: 'Sessions unused for this long are treated as expired.',
    schema: z.number().int().min(1).max(365),
    default: 30,
  }),
  define({
    key: 'security.max_login_attempts',
    group: 'security',
    label: 'Failed login attempts before lockout',
    description: '0 disables lockout. Counted per account, not per IP.',
    schema: z.number().int().min(0).max(100),
    default: 5,
  }),
  define({
    key: 'security.lockout_minutes',
    group: 'security',
    label: 'Lockout duration (minutes)',
    description: 'How long an account stays locked after too many failures.',
    schema: z.number().int().min(1).max(10_080),
    default: 15,
  }),
] as const

export type SettingKey = (typeof SETTING_DEFINITIONS)[number]['key']

export const SETTING_DEFINITION_BY_KEY = new Map<string, SettingDefinition<unknown>>(
  SETTING_DEFINITIONS.map((d) => [d.key, d as SettingDefinition<unknown>]),
)

/** Maps a setting key to the type its definition declares. */
export type SettingValue<K extends SettingKey> = Extract<
  (typeof SETTING_DEFINITIONS)[number],
  { key: K }
>['default']
