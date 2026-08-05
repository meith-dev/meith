/**
 * Mail drivers.
 *
 * Every implementation is expected to be called from a queued job, never inline
 * in a request. Throwing is the correct way to signal failure: the queue's
 * backoff and dead-lettering is the retry mechanism, so these drivers
 * deliberately contain no retry logic of their own.
 */

import { ConfigurationError, logger, type MailDriver, type OutgoingMail } from '@meith/core'

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
 * Compose an RFC 5322 `From` value from the board's address and its display
 * name.
 *
 * The name is operator-supplied text (`mail.from_name`) on its way into a
 * header, so it is **sanitised rather than trusted**:
 *
 *  - Control characters go, CR and LF above all. A newline in a header value is
 *    header injection wherever this string reaches SMTP, and the fact that JSON
 *    would escape it on *this* transport is a property of one driver rather
 *    than a reason to hand a provider a name with a line break in it.
 *  - `\` and `"` are escaped, because the name is emitted as a quoted string —
 *    a name containing a quote would otherwise close it early and leave the
 *    rest to be parsed as address syntax.
 *  - Always quoted, never bare. An unquoted display name may not contain `.`,
 *    `,` or `@`, and "Board Admin, Ltd." is an ordinary thing to type.
 *
 * A name that is empty once trimmed yields the bare address — the same header
 * every message carried before this field existed.
 */
export function formatSender(address: string, name?: string): string {
  const cleaned = stripControlCharacters(name ?? '').trim()
  if (cleaned === '') return address

  const escaped = cleaned.replace(/([\\"])/g, '\\$1')
  return `"${escaped}" <${address}>`
}

/**
 * Drop every C0/C1 control character and DEL.
 *
 * The class is written as escapes rather than as literal characters: a raw
 * control character in source is invisible in every editor and diff, which is
 * why the workspace guard bans one — and this is the file where naming them is
 * the whole point.
 */
function stripControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex -- matching control characters is this function's job
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
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
          from: formatSender(this.from, mail.fromName),
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
