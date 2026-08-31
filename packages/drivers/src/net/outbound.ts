import { lookup as dnsLookupAsync } from 'node:dns/promises'
import { isIP } from 'node:net'

import { env, isProduction } from '@meith/core'
import {
  assertAllowedUrl,
  BlockedOutboundError,
  guardedRequest,
  isBlockedAddress,
} from '@meith/core/outbound'

export { BlockedOutboundError } from '@meith/core/outbound'

export function mailAllowsPrivateHosts(): boolean {
  return env.MAIL_ALLOW_PRIVATE_HOSTS || !isProduction()
}

export function assertSafeMailEndpoint(rawUrl: string, allowPrivateHosts: boolean): URL {
  return assertAllowedUrl(rawUrl, { allowPrivateHosts })
}

export async function assertSafeSmtpHost(host: string, allowPrivateHosts: boolean): Promise<void> {
  if (allowPrivateHosts) return

  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) {
      throw new BlockedOutboundError('The SMTP host is a private or internal address.')
    }
    return
  }

  const addresses = await dnsLookupAsync(host, { all: true })
  if (addresses.some((candidate) => isBlockedAddress(candidate.address))) {
    throw new BlockedOutboundError('The SMTP host resolves to a private or internal address.')
  }
}

export interface MailRequest {
  readonly url: URL
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
  readonly timeoutMs: number
  readonly allowPrivateHosts: boolean
}

export interface MailTransportResult {
  readonly status: number
  readonly diagnostic: string
}

export type HttpMailTransport = (request: MailRequest) => Promise<MailTransportResult>

export const guardedMailTransport: HttpMailTransport = (request) =>
  guardedRequest({
    url: request.url,
    method: 'POST',
    headers: request.headers,
    body: request.body,
    timeoutMs: request.timeoutMs,
    allowPrivateHosts: request.allowPrivateHosts,
  })
