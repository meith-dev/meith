/**
 * Mail drivers.
 *
 * Every implementation is expected to be called from a queued job, never inline
 * in a request. Throwing is the correct way to signal failure: the queue's
 * backoff and dead-lettering is the retry mechanism, so these drivers
 * deliberately contain no retry logic of their own.
 */

import { ConfigurationError, logger, type MailDriver, type OutgoingMail } from '@forum/core'

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
 * Generic transactional-mail HTTP driver (Resend, Postmark, Mailgun...).
 *
 * HTTP rather than SMTP by default because SMTP's long-lived sockets are a poor
 * fit for serverless, where a function may be frozen mid-handshake.
 */
export class HttpMailDriver implements MailDriver {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(mail: OutgoingMail): Promise<void> {
    /*
     * A hard timeout matters here: without it a hung provider holds the job's
     * lease open for its full duration, and the tick's time budget is consumed
     * by one stuck message.
     */
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.from,
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
