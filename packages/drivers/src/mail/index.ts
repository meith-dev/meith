import { ConfigurationError, logger, type MailDriver, type OutgoingMail } from '@meith/core'

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

export function formatSender(address: string, name?: string): string {
  const cleaned = stripControlCharacters(name ?? '').trim()
  if (cleaned === '') return address

  const escaped = cleaned.replace(/([\\"])/g, '\\$1')
  return `"${escaped}" <${address}>`
}

function stripControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex -- matching control characters is this function's job
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
}

export class HttpMailDriver implements MailDriver {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(mail: OutgoingMail): Promise<void> {
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
