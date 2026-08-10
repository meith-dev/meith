import { ConfigurationError, logger, type MailDriver, type OutgoingMail } from '@meith/core'
import type { SmtpMailConfig } from '@meith/settings'
import nodemailer, { type Transporter } from 'nodemailer'

import { formatSender } from './sender'

const CONNECTION_TIMEOUT_MS = 10_000
const GREETING_TIMEOUT_MS = 10_000
const SOCKET_TIMEOUT_MS = 20_000

function isPermanent(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { responseCode?: unknown; code?: unknown }

  if (typeof candidate.responseCode === 'number') {
    return candidate.responseCode >= 500 && candidate.responseCode < 600
  }

  return candidate.code === 'EAUTH'
}

function describe(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error)
  const candidate = error as { responseCode?: unknown; code?: unknown; message?: unknown }

  const code =
    typeof candidate.responseCode === 'number'
      ? String(candidate.responseCode)
      : typeof candidate.code === 'string'
        ? candidate.code
        : ''
  const message = typeof candidate.message === 'string' ? candidate.message : String(error)

  return (code === '' ? message : `${code} ${message}`).slice(0, 300)
}

export class SmtpMailDriver implements MailDriver {
  private readonly transport: Transporter

  constructor(private readonly config: SmtpMailConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.security === 'tls',
      requireTLS: config.security === 'starttls',
      ...(config.username === ''
        ? {}
        : { auth: { user: config.username, pass: config.password } }),
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    })
  }

  async send(mail: OutgoingMail): Promise<void> {
    try {
      await this.transport.sendMail({
        from: formatSender(this.config.from, mail.fromName),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html === undefined ? {} : { html: mail.html }),
        ...(mail.replyTo === undefined ? {} : { replyTo: mail.replyTo }),
      })
    } catch (error) {
      const detail = describe(error)
      logger({ driver: 'smtp', host: this.config.host }).warn(
        { to: mail.to, err: detail },
        'smtp send failed',
      )

      if (isPermanent(error)) {
        throw new ConfigurationError(`The SMTP server rejected the message: ${detail}`)
      }
      throw new Error(`SMTP error: ${detail}`, { cause: error })
    }
  }
}
