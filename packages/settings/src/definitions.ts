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
  /** F62. Its own group rather than an extension of 'posting': reputation is
      about members rather than about content, and an operator looking for it
      would not find it under posting. */
  | 'reputation'
  | 'security'
  /**
   * F46. Its own group rather than an extension of 'security', on F62's
   * reasoning: 'security' is about signing in — attempts, lockout, session
   * length — and anti-spam is about strangers arriving. An operator whose board
   * is being flooded looks for "spam", and nine settings buried under a heading
   * about passwords are nine settings they do not find.
   */
  | 'antispam'
  /**
   * What the board asks its readers before processing anything optional. Its
   * own group rather than a corner of 'board', because an operator looking for
   * it is answering a question somebody else asked them — a regulator, a
   * customer, their own legal advice — and will look for the word.
   */
  | 'privacy'

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
  /**
   * Hints the generated form (F64) cannot derive.
   *
   * Everything derivable is derived: `typeof default` already says string,
   * number or boolean. Only what a type cannot say is declared here — see
   * `fields.ts`, and note that `min`/`max` restate what the schema validates
   * and are checked against it by a test.
   */
  readonly ui?: {
    /** A string that wants a textarea rather than one line. */
    readonly multiline?: boolean
    /** An enum's choices, with the words an operator should see. */
    readonly options?: readonly {
      readonly value: string
      readonly label: string
    }[]
    readonly min?: number
    readonly max?: number
    /**
     * Hidden unless the operator asks for advanced settings.
     *
     * For the ones where a wrong value is not merely wrong but *locks somebody
     * out* or breaks a running board — not merely for the ones that are rarely
     * changed. A screen that hides half of itself by default teaches people to
     * click "advanced" first, which defeats it.
     */
    readonly advanced?: boolean
    /**
     * Owned by a screen of its own, so the generated form does not draw it.
     *
     * For a value that is real configuration but is not *typed* by an operator:
     * the board logo's storage key is written by an upload and read by the
     * header, and rendering it as a text box would invite somebody to paste a
     * path at it and get a broken image with no explanation.
     *
     * It stays in this registry rather than moving somewhere private, because
     * everything else the registry gives it is still wanted — a declared type,
     * a default, cache invalidation on write, and `settings:get` from the CLI
     * when a board is broken and the panel is not reachable.
     */
    readonly managed?: boolean
  }
}

export type SettingDefinition<T = unknown> = SettingDefinitionBase<T>

/** Helper preserving the literal value type through the definition. */
/**
 * Attach the type, and **keep the key literal**.
 *
 * The `K` is the entire point of the second type parameter. Without it the
 * return type widens `key` to `string`, which is what this signature used to
 * do — and the consequence was silent and total: `SettingKey` became `string`,
 * so any key at all type-checked, and `SettingValue<K>` became `never`, because
 * `Extract<{ key: string, … }, { key: 'board.name' }>` matches nothing.
 *
 * `never` is assignable to everything, so nothing complained. Every
 * `settings.get('board.name')` on the board was typed `never` and every
 * assignment of one still compiled. It surfaced the first time somebody called
 * a method on the result rather than assigning it.
 *
 * `definitions.type-test.ts` is the deliberate violation that keeps this
 * honest — put the old signature back and it fails loudly (D10).
 */
function define<T, K extends string>(
  d: SettingDefinitionBase<T> & { readonly key: K },
): SettingDefinition<T> & { readonly key: K } {
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
    default: 'Meith',
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
    ui: { multiline: true },
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
    ui: { advanced: true },
  }),
  define({
    key: 'board.offline_message',
    group: 'board',
    label: 'Offline message',
    description: 'Shown to visitors while the board is offline.',
    schema: z.string().max(2000),
    default: 'The board is temporarily unavailable for maintenance.',
    invalidates: ['settings'],
    ui: { multiline: true, advanced: true },
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
    ui: {
      options: [
        { value: 'none', label: 'Nothing further — the account works at once' },
        { value: 'email', label: 'Confirm the e-mail address' },
        { value: 'admin', label: 'An administrator approves each account' },
        {
          value: 'both',
          label: 'Confirm the address, then an administrator approves',
        },
      ],
    },
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
    ui: { min: 8, max: 128 },
  }),
  define({
    key: 'registration.username_min',
    group: 'registration',
    label: 'Minimum username length',
    description: 'Counted in Unicode code points, not bytes.',
    schema: z.number().int().min(1).max(64),
    default: 3,
    ui: { min: 1, max: 64 },
  }),
  define({
    key: 'registration.username_max',
    group: 'registration',
    label: 'Maximum username length',
    description: 'Must not exceed the 64-character database column.',
    schema: z.number().int().min(1).max(64),
    default: 30,
    ui: { min: 1, max: 64 },
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
    ui: { min: 0, max: 3600 },
  }),
  define({
    key: 'posting.max_length',
    group: 'posting',
    label: 'Maximum post length',
    description: 'Characters of source text, before rendering.',
    schema: z.number().int().min(100).max(200_000),
    default: 30_000,
    ui: { min: 100, max: 200_000 },
  }),
  define({
    key: 'posting.thread_ratings_enabled',
    group: 'posting',
    label: 'Thread ratings enabled',
    description: 'Members with permission can give each thread one 1–5 rating.',
    schema: z.boolean(),
    default: true,
    invalidates: ['settings'],
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
    ui: { min: 0, max: 86_400 },
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
    ui: { min: 5, max: 100 },
  }),
  define({
    key: 'display.posts_per_page',
    group: 'display',
    label: 'Posts per page',
    description: 'Capped to protect the thread-view query budget (F31).',
    schema: z.number().int().min(5).max(100),
    default: 20,
    invalidates: ['settings'],
    ui: { min: 5, max: 100 },
  }),
  /*
   * `display.default_theme_id` used to be here, and it never did anything.
   *
   * It came from the build plan, which assumed MyBB's numeric theme ids. Themes
   * here are keyed by the string they are registered under in
   * `forum.config.ts`, so nothing could ever have read it — and now that the
   * board default is a real control (the `themes` table's `is_default`, set
   * from /admin/themes), an inert setting labelled "Default theme" is worse
   * than a missing one: it is a control an operator would reasonably use and
   * then wonder why the board ignored them.
   *
   * Removed rather than deprecated. A setting with no reader has no stored
   * value worth migrating, and `SettingsSnapshot` ignores a row whose key is not
   * in the registry, so an old row on an upgraded board is inert either way.
   */

  /*
   * The board's logo, in two schemes.
   *
   * Storage keys rather than URLs, and written by the upload on /admin/themes
   * rather than typed — hence `managed`. Two of them because a logo that reads
   * on a white page usually disappears on a black one, which is the same reason
   * the token editor has two colour fields per token rather than one.
   *
   * Empty means "no logo", and the header falls back to the board's name in
   * text. That is the state every board starts in and most boards stay in, so
   * it is the state the code treats as ordinary rather than as an error.
   */
  define({
    key: 'board.logo_light',
    group: 'board',
    label: 'Logo (light)',
    description: 'Shown in the header in place of the board name. Uploaded, not typed.',
    schema: z.string().max(300),
    default: '',
    invalidates: ['settings', 'layout'],
    ui: { managed: true },
  }),
  define({
    key: 'board.logo_dark',
    group: 'board',
    label: 'Logo (dark)',
    description: 'Used when the reader is in dark mode. Falls back to the light one.',
    schema: z.string().max(300),
    default: '',
    invalidates: ['settings', 'layout'],
    ui: { managed: true },
  }),
  /*
   * Not `managed`: this one *is* typed, and it is the only part of a logo a
   * screen reader ever gets. Left empty it becomes the board's name, which is
   * right far more often than it is wrong — a logo is nearly always a wordmark
   * of the thing it belongs to, and `alt=""` on the only link home is a
   * navigation dead end.
   */
  define({
    key: 'board.logo_alt',
    group: 'board',
    label: 'Logo alt text',
    description:
      'What a screen reader announces in place of the logo. Leave empty to use ' +
      'the board name, which is usually what the logo says anyway.',
    schema: z.string().max(200),
    default: '',
    invalidates: ['settings', 'layout'],
  }),

  /* ------------------------------ privacy ------------------------------ */
  /*
   * `auto` by default, which asks in the EEA, the UK and Switzerland — and asks
   * when the board cannot tell where a request came from, which is every
   * self-hosted board without a CDN in front of it.
   *
   * Defaulting to "ask when unsure" is the only defensible way round. The cost
   * of a false positive is a notice somebody did not need; the cost of a false
   * negative is a European reader's data reaching a third party without their
   * being asked. An operator who knows their audience turns it off in one
   * setting, and one who wants it everywhere says so.
   *
   * What the answer actually gates is the analytics script. The board's own
   * cookies — session, remember-me, CSRF, and the two appearance preferences a
   * member sets by pressing a control — are strictly necessary or explicitly
   * requested, and are not part of the question. `src/view/consent.ts` has the
   * long version.
   */
  define({
    key: 'privacy.cookie_consent',
    group: 'privacy',
    label: 'Ask before optional analytics',
    description:
      'Shows a notice before any analytics run. “Where required” asks in the ' +
      'EEA, the UK and Switzerland, and asks when the visitor’s country is ' +
      'unknown. Sign-in and appearance cookies are never part of the question.',
    schema: z.enum(['auto', 'always', 'off']),
    default: 'auto',
    invalidates: ['settings'],
    ui: {
      options: [
        { value: 'auto', label: 'Where required' },
        { value: 'always', label: 'Everywhere' },
        { value: 'off', label: 'Never ask' },
      ],
    },
  }),

  /* ------------------------------- search ------------------------------ */
  define({
    key: 'search.enabled',
    group: 'search',
    label: 'Enable search',
    description:
      'Turning this off hides search UI and returns 403 from the route.',
    schema: z.boolean(),
    default: true,
    invalidates: ['settings'],
  }),
  /*
   * F86. Off by default, and that is the honest default: a board that was never
   * a MyBB board should not carry routes for somebody else's URL scheme, and a
   * `/showthread.php` that answers on a fresh install is a fingerprint of
   * software the board is not running.
   *
   * An import turns it on. It stays a setting rather than being inferred from
   * "has anything been imported", because an operator who imported once and has
   * since rebuilt should be able to stop serving the old shapes.
   */
  define({
    /*
     * `board.` rather than `legacy.`, because a setting's key prefix and its
     * group have to agree — the ACP navigates by group and a test pins the
     * correspondence. The first version of this entry was `legacy.redirects` in
     * the `board` group and that test caught it, which is the registry's
     * convention doing exactly what it is for.
     */
    key: 'board.legacy_redirects',
    group: 'board',
    label: 'Redirect old MyBB URLs',
    description:
      'Answer MyBB addresses (showthread.php, Thread-Title-91 and the rest) with a 301 to ' +
      'the imported content. Needs an import: the redirect is a lookup in the legacy id map.',
    schema: z.boolean(),
    default: false,
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
    ui: { min: 0, max: 3600 },
  }),
  define({
    key: 'search.min_word_length',
    group: 'search',
    label: 'Minimum search term length',
    description: 'Shorter terms are dropped from the query.',
    schema: z.number().int().min(1).max(10),
    default: 3,
    ui: { min: 1, max: 10 },
  }),

  /* -------------------------------- mail ------------------------------- */
  define({
    key: 'mail.from_name',
    group: 'mail',
    label: 'Sender name',
    description:
      'Display name on outgoing mail. The address is MAIL_FROM (env).',
    schema: z.string().max(100),
    default: '',
  }),

  /* ---------------------------- reputation ----------------------------- */
  define({
    key: 'reputation.enabled',
    group: 'reputation',
    label: 'Reputation enabled',
    description:
      'Members can rate each other. Off hides every control and every total; ' +
      'existing ratings are kept, so switching it back on restores them.',
    schema: z.boolean(),
    default: true,
    invalidates: ['settings'],
  }),
  define({
    key: 'reputation.allow_negative',
    group: 'reputation',
    label: 'Allow negative ratings',
    description:
      'Members can rate somebody down as well as up. Off makes reputation a ' +
      'thanks button, which is what most boards actually want — and takes the ' +
      'Rate link off posts, since the Thanks button on each one is then the ' +
      'whole of what the rating form could offer.',
    schema: z.boolean(),
    default: false,
    invalidates: ['settings'],
  }),
  define({
    key: 'reputation.comment_required',
    group: 'reputation',
    label: 'Require a comment',
    description:
      'A rating must say why. A number with no reason attached is the part of ' +
      'reputation people argue about — but it also removes the one-press ' +
      'Thanks button from posts, because one press cannot carry a reason. Off ' +
      'by default: thanking an answer that helped should be a single click, ' +
      'and it is negative ratings that need explaining.',
    schema: z.boolean(),
    default: false,
    invalidates: ['settings'],
  }),
  define({
    key: 'reputation.min_posts_to_give',
    group: 'reputation',
    label: 'Posts required before rating',
    description:
      'A brand-new account cannot rate anybody until it has posted this many ' +
      'times. 0 disables the requirement.',
    schema: z.number().int().min(0).max(1000),
    default: 5,
    invalidates: ['settings'],
    ui: { min: 0, max: 1000 },
  }),

  /* ------------------------------ security ----------------------------- */
  define({
    key: 'security.session_idle_days',
    group: 'security',
    label: 'Session idle timeout (days)',
    description: 'Sessions unused for this long are treated as expired.',
    schema: z.number().int().min(1).max(365),
    default: 30,
    ui: { min: 1, max: 365, advanced: true },
  }),
  define({
    key: 'security.max_login_attempts',
    group: 'security',
    label: 'Failed login attempts before lockout',
    description: '0 disables lockout. Counted per account, not per IP.',
    schema: z.number().int().min(0).max(100),
    default: 5,
    ui: { min: 0, max: 100, advanced: true },
  }),
  define({
    key: 'security.lockout_minutes',
    group: 'security',
    label: 'Lockout duration (minutes)',
    description: 'How long an account stays locked after too many failures.',
    schema: z.number().int().min(1).max(10_080),
    default: 15,
    ui: { min: 1, max: 10_080, advanced: true },
  }),

  /* ------------------------------ antispam ------------------------------ */
  /*
   * F46. Every default here is chosen to be **inert on a fresh board**: the
   * captcha is off, the limits are off, and first-post moderation is off. An
   * anti-spam feature that arrives switched on is one that greets the operator
   * by breaking their registration form, and the board they are testing has no
   * spam on it yet. The honeypot is the exception — see its own note.
   */
  define({
    key: 'antispam.captcha_mode',
    group: 'antispam',
    label: 'Registration challenge',
    description:
      'Off, or a question you set. Swapping in a hosted captcha is a small ' +
      'amount of code against the provider seam, not a setting — see the ' +
      'plugin and anti-spam documentation.',
    schema: z.enum(['off', 'question']),
    default: 'off',
    ui: {
      options: [
        { value: 'off', label: 'No challenge' },
        { value: 'question', label: 'Ask a question' },
      ],
    },
  }),
  /*
   * On by default, and the only one that is. A honeypot costs a legitimate
   * visitor nothing — it is an invisible field they never see and never fill —
   * so there is no operator decision to defer, and a board that ships with it
   * off is a board where the cheapest control is the one nobody remembers.
   */
  define({
    key: 'antispam.honeypot',
    group: 'antispam',
    label: 'Hidden-field trap',
    description:
      'Adds a field a person never sees and a bot fills in. Costs a real ' +
      'visitor nothing, and catches the least sophisticated half of them.',
    schema: z.boolean(),
    default: true,
  }),
  define({
    key: 'antispam.min_form_seconds',
    group: 'antispam',
    label: 'Minimum seconds to fill the registration form',
    description:
      'A form submitted faster than this is treated as automated. 0 disables ' +
      'the check. Keep it low — a password manager filling a form in two ' +
      'seconds is a real person.',
    schema: z.number().int().min(0).max(120),
    default: 3,
    ui: { min: 0, max: 120 },
  }),
  define({
    key: 'antispam.moderate_first_posts',
    group: 'antispam',
    label: 'Hold a new member’s first posts',
    description:
      'Posts are held for approval until the account has this many. 0 ' +
      'disables it. The cheapest control a forum has: spam accounts post ' +
      'once and never return.',
    schema: z.number().int().min(0).max(50),
    default: 0,
    ui: { min: 0, max: 50 },
  }),

  /*
   * The five limits F46 names. All per hour, all counted in the database so
   * every instance shares one allowance, and all 0 by default.
   *
   * They are *limits*, not intervals: `posting.flood_seconds` already sets a
   * minimum gap between two posts, which stops a double-submit and does nothing
   * about a script posting every 31 seconds all night. The two compose.
   */
  define({
    key: 'antispam.post_per_hour',
    group: 'antispam',
    label: 'Posts per hour',
    description:
      'Threads and replies together. 0 disables the limit. Members with ' +
      '“bypass flood check” are exempt, as they are from the flood interval.',
    schema: z.number().int().min(0).max(10_000),
    default: 0,
    ui: { min: 0, max: 10_000 },
  }),
  define({
    key: 'antispam.search_per_hour',
    group: 'antispam',
    label: 'Searches per hour',
    description: 'Searching is the most expensive thing a guest can do. 0 disables.',
    schema: z.number().int().min(0).max(10_000),
    default: 0,
    ui: { min: 0, max: 10_000 },
  }),
  define({
    key: 'antispam.message_per_hour',
    group: 'antispam',
    label: 'Private messages per hour',
    description:
      'Counted per sender, not per recipient — one message to ten people is ' +
      'one send and ten deliveries.',
    schema: z.number().int().min(0).max(10_000),
    default: 0,
    ui: { min: 0, max: 10_000 },
  }),
  define({
    key: 'antispam.report_per_hour',
    group: 'antispam',
    label: 'Reports per hour',
    description:
      'A limit on reporting is a limit on asking for help, so set it high ' +
      'enough that a member having a bad day is not silenced. 0 disables.',
    schema: z.number().int().min(0).max(10_000),
    default: 0,
    ui: { min: 0, max: 10_000 },
  }),
  define({
    key: 'antispam.upload_per_hour',
    group: 'antispam',
    label: 'Uploads per hour',
    description: 'Attachments and avatars. 0 disables the limit.',
    schema: z.number().int().min(0).max(10_000),
    default: 0,
    ui: { min: 0, max: 10_000 },
  }),
] as const

export type SettingKey = (typeof SETTING_DEFINITIONS)[number]['key']

export const SETTING_DEFINITION_BY_KEY = new Map<
  string,
  SettingDefinition<unknown>
>(SETTING_DEFINITIONS.map((d) => [d.key, d as SettingDefinition<unknown>]))

/** Maps a setting key to the type its definition declares. */
export type SettingValue<K extends SettingKey> = Extract<
  (typeof SETTING_DEFINITIONS)[number],
  { key: K }
>['default']
