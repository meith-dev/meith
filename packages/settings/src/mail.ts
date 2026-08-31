import type { SettingsSnapshot } from './store'

export type MailSecurity = 'tls' | 'starttls' | 'none'

export type MailTransport = 'log' | 'http' | 'smtp'

export interface LogMailConfig {
  readonly transport: 'log'
}

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
  readonly username: string
  readonly password: string
}

export type MailConfig = LogMailConfig | HttpMailConfig | SmtpMailConfig

export const NO_MAIL: LogMailConfig = { transport: 'log' }

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

export type MailSource = 'environment' | 'board'

export interface MailResolution {
  readonly config: MailConfig
  readonly source: MailSource
  readonly problems: readonly string[]
}

function text(value: string | undefined): string {
  return (value ?? '').trim()
}

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
        security: settings.get('mail.smtp_security') as MailSecurity,
        username: text(settings.get('mail.smtp_username')),
        password: text(settings.get('mail.smtp_password')),
      }
    default:
      return NO_MAIL
  }
}

export function defaultPort(security: MailSecurity): number {
  return security === 'tls' ? 465 : 587
}

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
    if (config.username !== '' && config.password === '') {
      problems.push('An SMTP username was given with no password.')
    }
    if (config.username === '' && config.password !== '') {
      problems.push('An SMTP password was given with no username.')
    }
  }

  return problems
}

export function canSendMail(config: MailConfig): boolean {
  return config.transport !== 'log' && mailConfigProblems(config).length === 0
}

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

export function mailEndpointProblem(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 'That is not a URL.'
  }

  if (url.protocol !== 'https:') return 'The endpoint must be an https:// URL.'
  if (url.username !== '' || url.password !== '') {
    return 'The endpoint must not carry a username or password.'
  }
  return null
}

export interface MailPreset {
  readonly id: string
  readonly label: string
  readonly transport: 'http' | 'smtp'
  readonly note: string
  readonly endpoint?: string
  readonly host?: string
  readonly port?: number
  readonly security?: MailSecurity
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
