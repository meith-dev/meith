/**
 * Mail drivers.
 *
 * Every implementation is expected to be called from a queued job, never inline
 * in a request. Throwing is the correct way to signal failure: the queue's
 * backoff and dead-lettering is the retry mechanism, so these drivers
 * deliberately contain no retry logic of their own.
 *
 * ## Configuration is resolved per send, not per process
 *
 * `ConfiguredMailDriver` at the bottom of this file is the one every caller
 * actually holds. It exists because mail configuration became *board*
 * configuration — rows an administrator edits at three in the afternoon — while
 * `drivers()` is memoised for the life of the process and the worker's life is
 * measured in weeks. A driver chosen at boot would keep sending through last
 * month's provider until somebody restarted the container, and would keep
 * sending nothing at all for a board that fixed its settings after installing.
 */

import { ConfigurationError, logger, type MailDriver, type OutgoingMail } from '@meith/core'
import {
  canSendMail,
  describeMailConfig,
  mailConfigProblems,
  type HttpMailConfig,
  type MailConfig,
} from '@meith/settings'

import { formatSender } from './sender'
import { SmtpMailDriver } from './smtp'

export { formatSender } from './sender'
export { SmtpMailDriver } from './smtp'

/**
 * Writes mail to the log instead of sending it. The default in development and
 * tests so a stray registration cannot e-mail a real person.
 */
export class LogMailDriver implements MailDriver {
  send(mail: OutgoingMail): Promise<void> {
    logger({ driver: 'log' }).info(
      { to: mail.to, subject: mail.subject },
      'mail (not actually sent)',
    )
    return Promise.resolve()
  }
}

/** Collects messages in memory for assertions. Test use only. */
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

/**
 * Generic transactional-mail HTTP driver (Resend and anything shaped like it).
 *
 * Kept alongside SMTP rather than replaced by it. The field names below are
 * Resend's, which is the provider this board documents first, and an HTTP POST
 * has no handshake to get wrong — no port, no STARTTLS, no app password. For an
 * operator who has an API key and nothing else, it is the shorter path.
 */
export class HttpMailDriver implements MailDriver {
  constructor(private readonly config: HttpMailConfig) {}

  async send(mail: OutgoingMail): Promise<void> {
    /*
     * A hard timeout matters here: without it a hung provider holds the job's
     * lease open for its full duration, and the tick's time budget is consumed
     * by one stuck message.
     */
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
        /*
         * 4xx (bad address, rejected domain) will fail identically on every
         * retry, so surface it as configuration rather than burning the job's
         * whole attempt budget. 5xx and 429 are worth retrying.
         */
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

/**
 * Build the transport a config describes.
 *
 * Throws for a config that cannot send — an SMTP host with no port, a provider
 * API with no key — rather than constructing something that will fail later with
 * a message about a socket. `mailConfigProblems` is the shared statement of what
 * "complete" means, so the installer's form, the settings screen and this all
 * refuse the same inputs.
 *
 * Exported because two callers need a driver for a config that is *not* the
 * board's current one: the settings screen's test button, which sends through
 * what is on the form before it is saved, and the installer, which has no saved
 * settings to read.
 */
export function createMailDriver(config: MailConfig): MailDriver {
  if (config.transport === 'log') return new LogMailDriver()

  const problems = mailConfigProblems(config)
  if (problems.length > 0) {
    throw new ConfigurationError(`Mail is not fully configured: ${problems.join(' ')}`)
  }

  return config.transport === 'http' ? new HttpMailDriver(config) : new SmtpMailDriver(config)
}

/**
 * The driver everything downstream holds: one that asks what the configuration
 * is at the moment it is asked to send.
 *
 * ## The cache is keyed on the config, not on time
 *
 * Rebuilding a transport per message would re-resolve DNS and re-read the TLS
 * trust store for every notification in a digest run, so the built driver is
 * kept. It is kept **against a fingerprint of the config that built it**, which
 * is what makes a settings change take effect on the next message rather than on
 * the next deploy: a changed password produces a different fingerprint and
 * therefore a new transport, with no invalidation call to forget to make.
 *
 * ## A resolver that fails does not lose the message
 *
 * `resolve` reads the database. A database that is briefly unavailable must
 * produce a *throw*, so the queue retries — never a silent fall back to the log
 * driver, which would discard the message and report success. That distinction
 * is the whole reason `resolve.ts` refuses to downgrade a configured transport,
 * and it would be undone here by a well-meaning `catch`.
 */
export class ConfiguredMailDriver implements MailDriver {
  private cached: { readonly fingerprint: string; readonly driver: MailDriver } | null = null

  constructor(private readonly resolve: () => Promise<MailConfig>) {}

  async send(mail: OutgoingMail): Promise<void> {
    const config = await this.resolve()

    if (!canSendMail(config)) {
      /*
       * Logged at warn with the reason, because this is the failure an operator
       * is most likely to be looking for and the least likely to see: nothing
       * else in the system notices that a notification was never delivered.
       *
       * Not a throw. A board with mail switched off is a supported state, and
       * throwing would fill the dead-letter queue with messages nobody asked to
       * be sent — including, on a board that later configures mail, a backlog of
       * stale ones that would all arrive at once.
       */
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
