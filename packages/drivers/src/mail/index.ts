import { ConfigurationError, logger, type MailDriver, type OutgoingMail } from '@meith/core'
import {
  canSendMail,
  describeMailConfig,
  type HttpMailConfig,
  type MailConfig,
  mailConfigProblems,
} from '@meith/settings'

import {
  assertSafeMailEndpoint,
  BlockedOutboundError,
  guardedMailTransport,
  type HttpMailTransport,
  mailAllowsPrivateHosts,
} from '../net/outbound'
import { formatSender } from './sender'
import { SmtpMailDriver } from './smtp'

export { formatSender } from './sender'
export { SmtpMailDriver } from './smtp'

export class LogMailDriver implements MailDriver {
  send(mail: OutgoingMail): Promise<void> {
    logger({ driver: 'log' }).info(
      { to: mail.to, subject: mail.subject },
      'mail (not actually sent)',
    )
    return Promise.resolve()
  }
}

export class MemoryMailDriver implements MailDriver {
  readonly sent: OutgoingMail[] = []

  send(mail: OutgoingMail): Promise<void> {
    this.sent.push(mail)
    return Promise.resolve()
  }

  reset(): void {
    this.sent.length = 0
  }
}

export class HttpMailDriver implements MailDriver {
  constructor(
    private readonly config: HttpMailConfig,
    private readonly transport: HttpMailTransport = guardedMailTransport,
  ) {}

  async send(mail: OutgoingMail): Promise<void> {
    const allowPrivateHosts = mailAllowsPrivateHosts()

    try {
      const url = assertSafeMailEndpoint(this.config.endpoint, allowPrivateHosts)

      const result = await this.transport({
        url,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({
          from: formatSender(this.config.from, mail.fromName),
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
          ...(mail.html ? { html: mail.html } : {}),
          ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        }),
        timeoutMs: 10_000,
        allowPrivateHosts,
      })

      if (result.status >= 200 && result.status < 300) return

      logger({ driver: 'http', host: url.host }).warn(
        { status: result.status, sample: result.diagnostic },
        'mail provider returned a non-success status',
      )

      if (result.status >= 400 && result.status < 500 && result.status !== 429) {
        throw new ConfigurationError(`Mail provider rejected the message (HTTP ${result.status}).`)
      }
      throw new Error(`Mail provider error (HTTP ${result.status}).`)
    } catch (error) {
      if (error instanceof BlockedOutboundError) {
        throw new ConfigurationError(error.message, { cause: error })
      }
      throw error
    }
  }
}

export function createMailDriver(config: MailConfig): MailDriver {
  if (config.transport === 'log') return new LogMailDriver()

  const problems = mailConfigProblems(config)
  if (problems.length > 0) {
    throw new ConfigurationError(`Mail is not fully configured: ${problems.join(' ')}`)
  }

  return config.transport === 'http' ? new HttpMailDriver(config) : new SmtpMailDriver(config)
}

export class ConfiguredMailDriver implements MailDriver {
  private cached: { readonly fingerprint: string; readonly driver: MailDriver } | null = null

  constructor(private readonly resolve: () => Promise<MailConfig>) {}

  async send(mail: OutgoingMail): Promise<void> {
    const config = await this.resolve()

    if (!canSendMail(config)) {
      logger({ driver: 'mail' }).warn(
        { to: mail.to, subject: mail.subject, config: describeMailConfig(config) },
        'mail not sent: this board has no working mail configuration',
      )
      return
    }

    const fingerprint = JSON.stringify(config)
    if (this.cached === null || this.cached.fingerprint !== fingerprint) {
      this.cached = { fingerprint, driver: createMailDriver(config) }
    }

    await this.cached.driver.send(mail)
  }
}
