/**
 * The SMTP mail driver.
 *
 * ## Why this exists now, having been refused before
 *
 * `resolve.ts` threw for `MAIL_DRIVER=smtp` and the comment beside the throw was
 * right to: silently downgrading a configured transport to the log driver would
 * mean an operator watching password resets vanish with no error. What was
 * *wrong* was the reason SMTP had no implementation at all, which lived in the
 * driver interface's own header — "HTTP rather than SMTP by default because
 * SMTP's long-lived sockets are a poor fit for serverless, where a function may
 * be frozen mid-handshake".
 *
 * That argument does not apply to this board any more. D105 removed the
 * serverless route, and mail has never gone out on a request path regardless:
 * every message is queued and sent from the worker or the tick, which is an
 * ordinary long-lived Node process holding an ordinary socket.
 *
 * ## And why it is the transport worth having
 *
 * One implementation reaches every provider. Resend, Brevo, Postmark, Mailgun
 * and SES all speak SMTP, so does every mailbox host, and so does a relay an
 * operator runs themselves — where the HTTP driver reaches exactly those
 * providers that copied Resend's field names. More to the point, it is the only
 * transport that a self-hoster who *already receives mail on their domain* can
 * configure with no DNS work at all: SPF and DKIM are already published for that
 * domain, which is the step that otherwise stands between installing a board and
 * being able to mail anybody.
 */

import { ConfigurationError, logger, type MailDriver, type OutgoingMail } from '@meith/core'
import type { SmtpMailConfig } from '@meith/settings'
import nodemailer, { type Transporter } from 'nodemailer'

import { formatSender } from './sender'

/**
 * Every stage of the conversation is bounded.
 *
 * The unbounded one is what actually happens in the wild: a host that accepts
 * the TCP connection and never sends a greeting — the classic symptom of port
 * 465 configured as STARTTLS — holds the socket open indefinitely. Inside a
 * queue that means one message consuming the whole tick's budget on every
 * attempt until it dead-letters, which reads as "the queue is stuck" rather than
 * as "the port is wrong".
 */
const CONNECTION_TIMEOUT_MS = 10_000
const GREETING_TIMEOUT_MS = 10_000
const SOCKET_TIMEOUT_MS = 20_000

/**
 * SMTP reply codes that will fail identically forever.
 *
 * The 5xx class is permanent by definition (RFC 5321 §4.2.1): a bad mailbox, a
 * sender the relay will not accept, a message the provider refuses. Retrying one
 * burns the job's whole attempt budget to arrive at the same answer, so it is
 * reported as configuration — the same split `HttpMailDriver` makes at 4xx, for
 * the same reason, and the two must agree or the queue's behaviour depends on
 * which transport an operator picked.
 *
 * 4xx is explicitly *not* here. A greylisting relay answers 451 and means "ask
 * again in ten minutes", which is precisely what the queue's backoff does.
 */
function isPermanent(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { responseCode?: unknown; code?: unknown }

  if (typeof candidate.responseCode === 'number') {
    return candidate.responseCode >= 500 && candidate.responseCode < 600
  }

  /*
   * Authentication is permanent whatever code came with it. A wrong password is
   * not a transient condition, and a board that retried it five times per
   * message is a board being rate-limited — or locked out — by its own provider
   * for looking like a brute-force attempt.
   */
  return candidate.code === 'EAUTH'
}

/** Everything the message needs, with no credential anywhere near it. */
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
  /**
   * Built once and reused, but **not pooled**.
   *
   * Reused because constructing a transport per message re-resolves DNS and
   * re-reads the TLS trust store for no benefit. Not pooled because a pool keeps
   * idle sockets open against a provider that will close them itself, and a
   * board's mail volume — a handful of messages a tick — gains nothing from a
   * connection that was already going to be re-established.
   *
   * Unpooled also means there is nothing to shut down: nodemailer opens and
   * closes one connection per `sendMail`, so a one-shot `community tasks:run` that
   * sent a message exits rather than sitting at the prompt holding a socket.
   * That is why this class has no `close`.
   */
  private readonly transport: Transporter

  constructor(private readonly config: SmtpMailConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      /*
       * `secure` is implicit TLS and nothing else. The three-way `security`
       * setting exists because this boolean has two meanings and operators
       * reasonably assume it has one — see `MailSecurity` in @meith/settings.
       */
      secure: config.security === 'tls',
      /*
       * The half that boolean cannot say: with `secure: false`, nodemailer will
       * happily fall back to an unencrypted session if the server does not
       * advertise STARTTLS. `requireTLS` turns that into a refusal. A board that
       * quietly sent its SMTP password in the clear because a relay dropped its
       * capability line is the failure this prevents, and it is silent without it.
       */
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
