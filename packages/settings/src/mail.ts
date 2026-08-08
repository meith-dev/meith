/**
 * F55/F83 — what "mail is configured" actually means, decided in one place.
 *
 * Mail used to be four environment variables read directly by `resolve.ts`, and
 * that had one consequence which outweighed every convenience: **the only way to
 * configure mail was to redeploy.** A board is installed by somebody who does
 * not yet have a working board to read the handbook on, and the first thing that
 * needs mail is the confirmation link for the second member. Making that an
 * env-var edit put it after the board went live, which is where it stayed.
 *
 * So mail configuration is board configuration now — rows in `settings`, edited
 * on a screen, testable with a button — and the environment keeps a veto. This
 * module is the pure part of that: a config shape, two readers, and the
 * precedence rule between them. Nothing here reads the environment directly,
 * opens a socket or knows what a driver is, which is what makes "what does a
 * board with a half-filled SMTP form actually send" a unit test.
 *
 * ## The precedence rule, and why it is keyed on the value
 *
 * **`MAIL_DRIVER=http` or `MAIL_DRIVER=smtp` in the environment wins outright.**
 * Anything else — `log`, or nothing at all — hands the decision to the board's
 * own settings.
 *
 * It is keyed on the *value* rather than on whether the variable was present
 * because "present" is not a thing this side of the schema can see: `MAIL_DRIVER`
 * carries a zod default, compose files forward it as `${MAIL_DRIVER:-log}`, and
 * `withoutEmptyValues` deletes the empty string on the way in. A rule built on
 * presence would therefore mean something different in Docker than in a shell,
 * which is the worst property a precedence rule can have.
 *
 * The rule as written has the property that matters: **every existing board that
 * has working mail keeps it.** Configuring mail through the environment has
 * always meant setting `MAIL_DRIVER=http`, and that continues to be authoritative
 * and continues to ignore the database. What changes is only the board that never
 * set it — which previously could not send at all, and can now be fixed from the
 * panel without a deploy.
 */

import type { SettingsSnapshot } from './store'

/**
 * How the SMTP session is protected.
 *
 * Three values rather than a `secure: boolean`, because the boolean is the thing
 * everybody gets wrong. `secure: true` means *implicit* TLS — the socket is
 * encrypted before the first byte, which is port 465 — and `secure: false` does
 * **not** mean plaintext: it means "connect in the clear and upgrade with
 * STARTTLS", which is port 587 and is also encrypted. An operator reading a
 * checkbox labelled "secure" and unticking it for port 587 believes they have
 * turned encryption off, and an operator ticking it for port 587 gets a hang
 * rather than an error. Naming the three states removes the guess.
 */
export type MailSecurity =
  /** Implicit TLS from the first byte. Port 465. */
  | 'tls'
  /** Plain connection upgraded with STARTTLS, and required to succeed. Port 587. */
  | 'starttls'
  /**
   * No encryption, and no upgrade attempted. For a relay on localhost and
   * nothing else — a password on this transport crosses the network in the
   * clear.
   */
  | 'none'

export type MailTransport = 'log' | 'http' | 'smtp'

/** Sends nothing. Writes the recipient and subject to the log. */
export interface LogMailConfig {
  readonly transport: 'log'
}

/** A transactional provider's JSON API. See `HttpMailDriver` for the body. */
export interface HttpMailConfig {
  readonly transport: 'http'
  readonly from: string
  readonly endpoint: string
  readonly token: string
}

export interface SmtpMailConfig {
  readonly transport: 'smtp'
  readonly from: string
  readonly host: string
  readonly port: number
  readonly security: MailSecurity
  /** Empty for a relay that does not authenticate — localhost, mostly. */
  readonly username: string
  readonly password: string
}

export type MailConfig = LogMailConfig | HttpMailConfig | SmtpMailConfig

/** Nothing configured anywhere. The shape a fresh board resolves to. */
export const NO_MAIL: LogMailConfig = { transport: 'log' }

/**
 * The mail-related environment, as a value.
 *
 * Taken as an argument rather than imported from `@meith/core`: this is a domain
 * package, R2 says domain packages take their inputs, and the test for the
 * precedence rule would otherwise have to stub real environment variables to ask
 * a question about a pure function.
 */
export interface MailEnvironment {
  readonly MAIL_DRIVER?: MailTransport | undefined
  readonly MAIL_FROM?: string | undefined
  readonly MAIL_HTTP_ENDPOINT?: string | undefined
  readonly MAIL_HTTP_TOKEN?: string | undefined
  readonly MAIL_SMTP_HOST?: string | undefined
  readonly MAIL_SMTP_PORT?: number | undefined
  readonly MAIL_SMTP_SECURITY?: MailSecurity | undefined
  readonly MAIL_SMTP_USERNAME?: string | undefined
  readonly MAIL_SMTP_PASSWORD?: string | undefined
}

/** Which of the two sources the resolved config came from. */
export type MailSource =
  /** `MAIL_DRIVER` decided it. The panel can display it but must not offer to edit it. */
  | 'environment'
  /** The `settings` table decided it. Editable at `/admin/settings?group=mail`. */
  | 'board'

export interface MailResolution {
  readonly config: MailConfig
  readonly source: MailSource
  /**
   * What the chosen transport is missing, in the words an operator can act on.
   * Empty means the config is complete — which is a statement about *shape*, not
   * about whether the credentials work. Only a send proves that, which is what
   * the test button is for.
   */
  readonly problems: readonly string[]
}

/** Trim, and treat whitespace-only as absent. */
function text(value: string | undefined): string {
  return (value ?? '').trim()
}

/**
 * The environment's answer, or `null` when it is not asserting one.
 *
 * `null` rather than a log config, deliberately: "the environment does not
 * configure mail" and "the environment configures mail to send nothing" are
 * different claims, and only the first should defer to the database.
 */
export function mailConfigFromEnvironment(source: MailEnvironment): MailConfig | null {
  switch (source.MAIL_DRIVER) {
    case 'http':
      return {
        transport: 'http',
        from: text(source.MAIL_FROM),
        endpoint: text(source.MAIL_HTTP_ENDPOINT),
        token: text(source.MAIL_HTTP_TOKEN),
      }
    case 'smtp':
      return {
        transport: 'smtp',
        from: text(source.MAIL_FROM),
        host: text(source.MAIL_SMTP_HOST),
        port: source.MAIL_SMTP_PORT ?? defaultPort(source.MAIL_SMTP_SECURITY ?? 'starttls'),
        security: source.MAIL_SMTP_SECURITY ?? 'starttls',
        username: text(source.MAIL_SMTP_USERNAME),
        password: text(source.MAIL_SMTP_PASSWORD),
      }
    default:
      return null
  }
}

/** The board's answer. Always defined — a fresh board resolves to `log`. */
export function mailConfigFromSettings(settings: SettingsSnapshot): MailConfig {
  switch (settings.get('mail.transport')) {
    case 'http':
      return {
        transport: 'http',
        from: text(settings.get('mail.from')),
        endpoint: text(settings.get('mail.http_endpoint')),
        token: text(settings.get('mail.http_token')),
      }
    case 'smtp':
      return {
        transport: 'smtp',
        from: text(settings.get('mail.from')),
        host: text(settings.get('mail.smtp_host')),
        port: settings.get('mail.smtp_port'),
        /*
         * Cast, for the same reason `resolveAuthPolicy` casts its key: the
         * registry infers a definition's value type from its `default`, which
         * widens an enum's string literal back to `string`. The schema is the
         * thing that actually enforces the three values — a stored row outside
         * them falls back to the default before it ever reaches here.
         */
        security: settings.get('mail.smtp_security') as MailSecurity,
        username: text(settings.get('mail.smtp_username')),
        password: text(settings.get('mail.smtp_password')),
      }
    default:
      return NO_MAIL
  }
}

/**
 * The port an operator means when they pick a security mode and say nothing else.
 *
 * Exported because the install form and the settings screen both want to prefill
 * it, and a screen that offered 587 beside "implicit TLS" would be teaching the
 * mistake this module's `MailSecurity` comment exists to prevent.
 */
export function defaultPort(security: MailSecurity): number {
  return security === 'tls' ? 465 : 587
}

/**
 * Everything a caller needs to know about how this board sends mail.
 *
 * The one function `resolve.ts`, the installer's preflight, the settings screen
 * and the health view all go through, so none of them can develop a private
 * opinion about precedence.
 */
export function resolveMailConfig(input: {
  readonly environment: MailEnvironment
  readonly settings: SettingsSnapshot
}): MailResolution {
  const fromEnvironment = mailConfigFromEnvironment(input.environment)
  const config = fromEnvironment ?? mailConfigFromSettings(input.settings)

  return {
    config,
    source: fromEnvironment === null ? 'board' : 'environment',
    problems: mailConfigProblems(config),
  }
}

/**
 * What is missing, named the way the screen names it.
 *
 * A list rather than a boolean because "mail is not configured" is the message
 * that wastes an afternoon. The operator who filled in a host and a password and
 * forgot the sender address needs to be told *that*, on the field, and this is
 * the shared statement of it — the installer, the panel and the CLI would
 * otherwise each grow their own and disagree at the edges.
 */
export function mailConfigProblems(config: MailConfig): readonly string[] {
  const problems: string[] = []

  if (config.transport === 'log') return problems

  if (config.from === '') {
    problems.push('No sender address. Mail needs an address to come from.')
  }

  if (config.transport === 'http') {
    if (config.endpoint === '') problems.push('No API endpoint.')
    if (config.token === '') problems.push('No API key.')
  }

  if (config.transport === 'smtp') {
    if (config.host === '') problems.push('No SMTP host.')
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      problems.push('The SMTP port must be between 1 and 65535.')
    }
    /*
     * A username with no password is a typo; *neither* is a legitimate
     * unauthenticated relay, which is why the check is on the pair rather than
     * on each field. Boards that run their own Postfix on localhost are the
     * reason this is not simply "credentials are required".
     */
    if (config.username !== '' && config.password === '') {
      problems.push('An SMTP username was given with no password.')
    }
    if (config.username === '' && config.password !== '') {
      problems.push('An SMTP password was given with no username.')
    }
  }

  return problems
}

/** Is this board able to send a message to a stranger? */
export function canSendMail(config: MailConfig): boolean {
  return config.transport !== 'log' && mailConfigProblems(config).length === 0
}

/**
 * One line, for a screen or a log.
 *
 * Names the host or the endpoint, and never the credential. This string is
 * rendered in the panel, written to the audit log, and printed by the CLI, so
 * "safe to show somebody who may not be an administrator" is a property it has
 * to keep rather than one each caller has to remember.
 */
export function describeMailConfig(config: MailConfig): string {
  switch (config.transport) {
    case 'log':
      return 'Not sending — messages are written to the server log'
    case 'http':
      return `HTTP API at ${hostOf(config.endpoint)}, from ${config.from || '(no address)'}`
    case 'smtp':
      return (
        `SMTP to ${config.host || '(no host)'}:${config.port} (${config.security}), ` +
        `from ${config.from || '(no address)'}`
      )
  }
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint === '' ? '(no endpoint)' : endpoint
  }
}

/**
 * Providers, prefilled.
 *
 * These are **conveniences, not integrations**: every one is the generic HTTP or
 * SMTP transport with the fields already typed in, and adding a row here adds no
 * code path. That is the point — a registry of adapters would need one of them
 * per provider and would be wrong within a year, whereas a host and a port age
 * slowly and are visibly editable when they do.
 *
 * `note` is what will actually bite, and is deliberately the *first* thing the
 * screen shows for a choice rather than a footnote: every provider on this list
 * needs its sending domain verified through DNS before it will carry a message
 * to anybody, and an operator who learns that after installing has already sent
 * a broken invitation to their members.
 */
export interface MailPreset {
  readonly id: string
  readonly label: string
  readonly transport: 'http' | 'smtp'
  readonly note: string
  readonly endpoint?: string
  readonly host?: string
  readonly port?: number
  readonly security?: MailSecurity
  /** Fixed username, where the provider mandates one. Resend's is the literal "resend". */
  readonly username?: string
}

export const MAIL_PRESETS: readonly MailPreset[] = [
  {
    id: 'mailbox',
    label: 'A mailbox I already have (SMTP)',
    transport: 'smtp',
    note:
      'The least work by a distance, if you already receive mail on this domain: ' +
      'SPF and DKIM are set up already, so there are no DNS records to add. Use ' +
      'your provider’s SMTP host and an app password — never your login password.',
    port: 465,
    security: 'tls',
  },
  {
    id: 'resend-http',
    label: 'Resend (API)',
    transport: 'http',
    endpoint: 'https://api.resend.com/emails',
    note:
      'Free for 3,000 messages a month. You must verify your sending domain with ' +
      'Resend first — until you do, a new account can only mail the address you ' +
      'signed up with, and every other message is rejected.',
  },
  {
    id: 'resend-smtp',
    label: 'Resend (SMTP)',
    transport: 'smtp',
    host: 'smtp.resend.com',
    port: 465,
    security: 'tls',
    username: 'resend',
    note:
      'The same service as the row above, over SMTP. The username is the literal ' +
      'word “resend” and the password is your API key. Verify your domain first.',
  },
  {
    id: 'brevo',
    label: 'Brevo (SMTP)',
    transport: 'smtp',
    host: 'smtp-relay.brevo.com',
    port: 587,
    security: 'starttls',
    note:
      'The most generous free tier — around 300 messages a day. Independent ' +
      'deliverability testing puts it below Postmark and Resend, which matters ' +
      'most for password resets. Verify your domain first.',
  },
  {
    id: 'postmark',
    label: 'Postmark (SMTP)',
    transport: 'smtp',
    host: 'smtp.postmarkapp.com',
    port: 587,
    security: 'starttls',
    note:
      'The best-delivering of these and the stingiest — 100 messages a month free, ' +
      'and an approval step before you can send at all. Username and password are ' +
      'both the server API token. Verify your domain first.',
  },
  {
    id: 'ses',
    label: 'Amazon SES (SMTP)',
    transport: 'smtp',
    port: 587,
    security: 'starttls',
    note:
      'The cheapest at volume and the most work to start: a new account is in a ' +
      'sandbox that can only mail verified addresses, and leaving it needs a ' +
      'support request. The host is email-smtp.<your-region>.amazonaws.com, and ' +
      'the credentials are SMTP credentials — not your AWS access keys.',
  },
  {
    id: 'smtp',
    label: 'Any other SMTP server',
    transport: 'smtp',
    port: 587,
    security: 'starttls',
    note: 'Anything that speaks SMTP, including a relay you run yourself.',
  },
  {
    id: 'http',
    label: 'Any other JSON API',
    transport: 'http',
    note:
      'Only works for a provider whose API takes Resend’s exact field names — ' +
      'from, to, subject, text, html, reply_to — with a Bearer token. Postmark and ' +
      'Mailgun do not; use their SMTP hosts instead.',
  },
]

export const MAIL_PRESET_BY_ID: ReadonlyMap<string, MailPreset> = new Map(
  MAIL_PRESETS.map((preset) => [preset.id, preset]),
)
