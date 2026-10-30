import { isIP } from 'node:net'

import nodemailer from 'nodemailer'

import { ConfigurationError, logger, type MailDriver, type OutgoingMail } from '@meith/core'
import type { SmtpMailConfig } from '@meith/settings'

import { BlockedOutboundError, mailAllowsPrivateHosts, resolveSafeSmtpHost } from '../net/outbound'
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
  constructor(private readonly config: SmtpMailConfig) {}

  async send(mail: OutgoingMail): Promise<void> {
    let host: string
    try {
      host = await resolveSafeSmtpHost(this.config.host, mailAllowsPrivateHosts())
    } catch (error) {
      if (error instanceof BlockedOutboundError) {
        throw new ConfigurationError(error.message, { cause: error })
      }
      throw error
    }

    const config = this.config
    const transport = nodemailer.createTransport({
      host,
      port: config.port,
      secure: config.security === 'tls',
      requireTLS: config.security === 'starttls',
      ...(isIP(config.host) === 0 ? { tls: { servername: config.host } } : {}),
      ...(config.username === '' ? {} : { auth: { user: config.username, pass: config.password } }),
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    })

    try {
      await transport.sendMail({
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
