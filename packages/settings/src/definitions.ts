import { z } from 'zod'

import { DEFAULT_PRIVACY_POLICY, DEFAULT_TERMS_OF_SERVICE } from './legal'
import { isUsableOrigin } from './origin'

export type SettingGroup =
  | 'board'
  | 'registration'
  | 'posting'
  | 'display'
  | 'search'
  | 'mail'
  | 'reputation'
  | 'security'
  | 'antispam'
  | 'legal'

interface SettingDefinitionBase<T> {
  readonly key: string
  readonly group: SettingGroup
  readonly label: string
  readonly description: string
  readonly schema: z.ZodType<T>
  readonly default: T
  readonly invalidates?: readonly string[]
  readonly secret?: boolean
  readonly ui?: {
    readonly multiline?: boolean
    readonly options?: readonly {
      readonly value: string
      readonly label: string
    }[]
    readonly min?: number
    readonly max?: number
    readonly advanced?: boolean
    readonly managed?: boolean
  }
}

export type SettingDefinition<T = unknown> = SettingDefinitionBase<T>

function define<T, K extends string>(
  d: SettingDefinitionBase<T> & { readonly key: K },
): SettingDefinition<T> & { readonly key: K } {
  return d
}

export const SETTING_DEFINITIONS = [
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
    key: 'board.url',
    group: 'board',
    label: 'Board address',
    description:
      'The absolute public origin, with no trailing slash — https://forum.example. ' +
      'Every link the board sends is built from it, because nothing in a queued ' +
      'job or a mail template knows the request that caused it. Left empty, mail ' +
      'still arrives and carries no link. Setting APP_URL in the environment ' +
      'overrides this and makes the box below inert.',
    schema: z.string().trim().refine(
      (value) => value === '' || isUsableOrigin(value),
      'Give an absolute http(s) address with no path — https://forum.example.',
    ),
    default: '',
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
      'Closes every board page to everyone without the "can view board offline" ' +
      'permission: they get the offline message instead, and the board’s feeds ' +
      'answer 503. Administrators keep access so they can finish maintenance, and ' +
      'the login screen, the control panel and the health endpoint stay reachable. ' +
      'An offline board is never indexable.',
    schema: z.boolean(),
    default: false,
    invalidates: ['settings', 'layout'],
    ui: { advanced: true },
  }),
  define({
    key: 'board.offline_message',
    group: 'board',
    label: 'Offline message',
    description:
      'Shown on the offline page, and returned as the body of the 503 the feeds ' +
      'answer with. Left empty, a plain maintenance line is shown instead.',
    schema: z.string().max(2000),
    default: 'The board is temporarily unavailable for maintenance.',
    invalidates: ['settings'],
    ui: { multiline: true, advanced: true },
  }),

  define({
    key: 'registration.enabled',
    group: 'registration',
    label: 'Allow new registrations',
    description:
      'Off closes the board to new members: the Register link goes, /register ' +
      'says so instead of offering a form, and the action behind it refuses a ' +
      'submission sent straight to it. Existing members sign in as before, the ' +
      'installer still creates the first administrator, and ' +
      '"community user:create" still works — closing the door is not the same ' +
      'as locking yourself out.',
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
    default: 'none',
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
      'ones — those are rehashed on next login.',
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
      'Seconds after posting during which an author fixing their own post ' +
      'leaves no "edited by" notice on it. 0 always shows the notice. A ' +
      'moderator editing somebody else\'s post is never silent, however soon ' +
      'it happens, and the revision history records every edit either way — ' +
      'this hides the line under the post, nothing else.',
    schema: z.number().int().min(0).max(86_400),
    default: 300,
    ui: { min: 0, max: 86_400 },
  }),

  define({
    key: 'display.threads_per_page',
    group: 'display',
    label: 'Threads per page',
    description: 'Capped to protect the forum-display query budget.',
    schema: z.number().int().min(5).max(100),
    default: 25,
    invalidates: ['settings'],
    ui: { min: 5, max: 100 },
  }),
  define({
    key: 'display.posts_per_page',
    group: 'display',
    label: 'Posts per page',
    description: 'Capped to protect the thread-view query budget.',
    schema: z.number().int().min(5).max(100),
    default: 20,
    invalidates: ['settings'],
    ui: { min: 5, max: 100 },
  }),

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

  define({
    key: 'search.enabled',
    group: 'search',
    label: 'Enable search',
    description:
      'Off takes the Search link out of the board navigation, replaces /search ' +
      'and any results page still linked to with a line saying so, and answers ' +
      'GET /api/v1/search with a 403. The index is kept and goes on being ' +
      'maintained, so switching it back on needs no reindex.',
    schema: z.boolean(),
    default: true,
    invalidates: ['settings'],
  }),
  define({
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
    label: 'Shortest word a search may rest on',
    description:
      'A search is refused unless at least one of its words is this long, so ' +
      'at 3 "a good post" runs and "a b c" does not. The short words are not ' +
      'dropped — they are still sent to the index, which drops the ones ' +
      'carrying no meaning on its own. Raise it if short words are what your ' +
      'expensive searches turn out to be.',
    schema: z.number().int().min(1).max(10),
    default: 2,
    ui: { min: 1, max: 10 },
  }),

  define({
    key: 'mail.transport',
    group: 'mail',
    label: 'How mail is sent',
    description:
      'A provider’s JSON API, an SMTP server, or nothing at all. "Not sending" ' +
      'writes each message to the server log and delivers none of them — which ' +
      'is the right default for a board nobody has configured yet, and a broken ' +
      'board the moment registration asks anybody to confirm an address.',
    schema: z.enum(['log', 'http', 'smtp']),
    default: 'log',
    ui: {
      options: [
        { value: 'log', label: 'Not sending (log only)' },
        { value: 'smtp', label: 'SMTP server' },
        { value: 'http', label: 'Provider API (Resend-compatible JSON)' },
      ],
    },
  }),
  define({
    key: 'mail.from',
    group: 'mail',
    label: 'Sender address',
    description:
      'The address every message comes from. It must be on a domain the ' +
      'provider has verified — a sender the provider does not recognise is ' +
      'rejected outright, and the rejection is not retried because it would ' +
      'fail identically every time.',
    schema: z.string().trim().refine(
      (value) => value === '' || z.string().email().safeParse(value).success,
      'That does not look like an e-mail address.',
    ),
    default: '',
  }),
  define({
    key: 'mail.from_name',
    group: 'mail',
    label: 'Sender name',
    description:
      'Display name shown beside the sender address. Empty sends the bare ' +
      'address.',
    schema: z.string().max(100),
    default: '',
  }),
  define({
    key: 'mail.http_endpoint',
    group: 'mail',
    label: 'Provider API endpoint',
    description:
      'Only for the provider-API transport. The board posts Resend’s exact ' +
      'field names with a Bearer token, so this works for Resend and for ' +
      'anything that copies it — and not for Postmark or Mailgun, whose SMTP ' +
      'hosts are the way in.',
    schema: z.string().trim().refine(
      (value) => value === '' || z.string().url().safeParse(value).success,
      'That is not a URL.',
    ),
    default: '',
  }),
  define({
    key: 'mail.http_token',
    group: 'mail',
    label: 'Provider API key',
    description: 'Only for the provider-API transport. Stored on the board.',
    schema: z.string().trim().max(500),
    default: '',
    secret: true,
  }),
  define({
    key: 'mail.smtp_host',
    group: 'mail',
    label: 'SMTP host',
    description: 'Only for the SMTP transport. For example smtp.resend.com.',
    schema: z.string().trim().max(255),
    default: '',
  }),
  define({
    key: 'mail.smtp_port',
    group: 'mail',
    label: 'SMTP port',
    description:
      '465 for implicit TLS, 587 for STARTTLS. Picking the security mode below ' +
      'that does not match the port is the usual cause of a connection that ' +
      'hangs rather than failing.',
    schema: z.number().int().min(1).max(65535),
    default: 587,
    ui: { min: 1, max: 65535 },
  }),
  define({
    key: 'mail.smtp_security',
    group: 'mail',
    label: 'SMTP security',
    description:
      'Implicit TLS encrypts the socket before the first byte (port 465). ' +
      'STARTTLS connects in the clear and upgrades, and the board refuses to ' +
      'continue if the upgrade fails (port 587). "None" is genuinely ' +
      'unencrypted and is for a relay on this machine and nothing else.',
    schema: z.enum(['tls', 'starttls', 'none']),
    default: 'starttls',
    ui: {
      options: [
        { value: 'starttls', label: 'STARTTLS, required (port 587)' },
        { value: 'tls', label: 'Implicit TLS (port 465)' },
        { value: 'none', label: 'None — local relay only' },
      ],
    },
  }),
  define({
    key: 'mail.smtp_username',
    group: 'mail',
    label: 'SMTP username',
    description:
      'Empty only for a relay that does not authenticate. Resend wants the ' +
      'literal word “resend” here, with the API key as the password.',
    schema: z.string().trim().max(255),
    default: '',
  }),
  define({
    key: 'mail.smtp_password',
    group: 'mail',
    label: 'SMTP password',
    description:
      'Use an app password rather than the password you sign in with, wherever ' +
      'the provider offers one. Stored on the board.',
    schema: z.string().trim().max(500),
    default: '',
    secret: true,
  }),

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

  define({
    key: 'security.session_idle_days',
    group: 'security',
    label: 'Session idle timeout (days)',
    description:
      'Sessions unused for this long are treated as expired. Separate from ' +
      '“keep me signed in”, which is a different token with a longer life of ' +
      'its own.',
    schema: z.number().int().min(1).max(365),
    default: 14,
    ui: { min: 1, max: 365, advanced: true },
  }),
  define({
    key: 'security.max_login_attempts',
    group: 'security',
    label: 'Failed login attempts before lockout',
    description:
      'Counted per account per address, so somebody guessing at one account ' +
      'from one place meets this first. 0 disables it.',
    schema: z.number().int().min(0).max(100),
    default: 5,
    ui: { min: 0, max: 100, advanced: true },
  }),
  define({
    key: 'security.max_account_login_attempts',
    group: 'security',
    label: 'Failed login attempts before an account locks everywhere',
    description:
      'The same count for one account across every address at once, which is ' +
      'what a guess spread over a botnet meets. Keep it well above the ' +
      'per-address number — it locks the real owner out too, which is the ' +
      'cost of it working at all. 0 disables it.',
    schema: z.number().int().min(0).max(10_000),
    default: 50,
    ui: { min: 0, max: 10_000, advanced: true },
  }),
  define({
    key: 'security.lockout_minutes',
    group: 'security',
    label: 'Lockout duration (minutes)',
    description:
      'How long an account stays locked after too many failures. The window ' +
      'the counts above are measured over, and the one the per-address limit ' +
      'on the anti-spam screen shares.',
    schema: z.number().int().min(1).max(10_080),
    default: 15,
    ui: { min: 1, max: 10_080, advanced: true },
  }),

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
      'disables it. The cheapest control a board has: spam accounts post ' +
      'once and never return.',
    schema: z.number().int().min(0).max(50),
    default: 0,
    ui: { min: 0, max: 50 },
  }),

  define({
    key: 'antispam.register_ip_per_hour',
    group: 'antispam',
    label: 'Registrations per hour from one address',
    description:
      'Counted per /24 (or /48), so a household or an office shares one ' +
      'allowance. Independent of the challenge: a board with no captcha is ' +
      'the one that needs this most. 0 disables the limit.',
    schema: z.number().int().min(0).max(10_000),
    default: 10,
    ui: { min: 0, max: 10_000 },
  }),
  define({
    key: 'antispam.reset_per_hour',
    group: 'antispam',
    label: 'Password reset requests per hour per address',
    description:
      'How many reset mails one e-mail address can be sent in an hour. ' +
      'Without it, the reset form is an e-mail cannon anybody can point at ' +
      'anybody. 0 disables the limit.',
    schema: z.number().int().min(0).max(10_000),
    default: 5,
    ui: { min: 0, max: 10_000 },
  }),
  define({
    key: 'antispam.reset_ip_per_hour',
    group: 'antispam',
    label: 'Password reset requests per hour from one address',
    description:
      'The same limit counted per requesting /24, which is what stops one ' +
      'caller working through a list of e-mail addresses. 0 disables it.',
    schema: z.number().int().min(0).max(10_000),
    default: 20,
    ui: { min: 0, max: 10_000 },
  }),
  define({
    key: 'antispam.login_ip_attempts',
    group: 'antispam',
    label: 'Failed logins from one address before lockout',
    description:
      'The per-account counters catch somebody guessing at one account. ' +
      'This one catches the opposite shape — a single guess against each of ' +
      'a thousand accounts — and shares the lockout window with them. ' +
      '0 disables it.',
    schema: z.number().int().min(0).max(10_000),
    default: 100,
    ui: { min: 0, max: 10_000, advanced: true },
  }),

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

  define({
    key: 'legal.terms',
    group: 'legal',
    label: 'Terms of service',
    description:
      'Markdown, published at /terms and linked from the footer. Registration ' +
      'asks the visitor to accept it before the account is created, so emptying ' +
      'this box takes the page, the footer link and the checkbox away together. ' +
      'What ships is a template written to be replaced: read it, make it say ' +
      'what your community actually does, and take advice on it if it matters.',
    schema: z.string().max(40_000),
    default: DEFAULT_TERMS_OF_SERVICE,
    invalidates: ['settings', 'layout'],
    ui: { multiline: true },
  }),
  define({
    key: 'legal.privacy',
    group: 'legal',
    label: 'Privacy policy',
    description:
      'Markdown, published at /privacy and linked from the footer. Emptied, the ' +
      'page and the link go. It ships as a template describing what this ' +
      'software does by default — your host, your mail provider and anything ' +
      'you have added are yours to describe.',
    schema: z.string().max(40_000),
    default: DEFAULT_PRIVACY_POLICY,
    invalidates: ['settings', 'layout'],
    ui: { multiline: true },
  }),
] as const

export type SettingKey = (typeof SETTING_DEFINITIONS)[number]['key']

export const SETTING_DEFINITION_BY_KEY = new Map<
  string,
  SettingDefinition<unknown>
>(SETTING_DEFINITIONS.map((d) => [d.key, d as SettingDefinition<unknown>]))

export type SettingValue<K extends SettingKey> = Extract<
  (typeof SETTING_DEFINITIONS)[number],
  { key: K }
>['default']
