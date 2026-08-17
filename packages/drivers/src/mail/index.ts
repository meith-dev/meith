import { ConfigurationError, logger, type MailDriver, type OutgoingMail } from '@meith/core'
import {
  canSendMail,
  describeMailConfig,
  type HttpMailConfig,
  type MailConfig,
  mailConfigProblems,
} from '@meith/settings'

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
  constructor(private readonly config: HttpMailConfig) {}

  async send(mail: OutgoingMail): Promise<void> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
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
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        const detail = `${response.status} ${body.slice(0, 200)}`

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new ConfigurationError(`Mail provider rejected the message: ${detail}`)
        }
        throw new Error(`Mail provider error: ${detail}`)
      }
    } finally {
      clearTimeout(timeout)
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
