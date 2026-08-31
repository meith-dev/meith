import { lookup as dnsLookup } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

export class BlockedOutboundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockedOutboundError'
  }
}

const IPV4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

const IPV6_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]

const BLOCKED = buildBlockList()

function buildBlockList(): BlockList {
  const list = new BlockList()
  for (const [address, prefix] of IPV4_BLOCKS) list.addSubnet(address, prefix, 'ipv4')
  for (const [address, prefix] of IPV6_BLOCKS) list.addSubnet(address, prefix, 'ipv6')
  return list
}

export function isBlockedAddress(address: string): boolean {
  const kind = isIP(address)
  if (kind === 0) return true
  return BLOCKED.check(address, kind === 4 ? 'ipv4' : 'ipv6')
}

function bareHost(url: URL): string {
  return url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname
}

export interface OutboundUrlPolicy {
  readonly allowPrivateHosts: boolean
}

export function assertAllowedUrl(rawUrl: string, policy: OutboundUrlPolicy): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new BlockedOutboundError('The destination is not a valid URL.')
  }

  const schemeAllowed =
    url.protocol === 'https:' || (policy.allowPrivateHosts && url.protocol === 'http:')
  if (!schemeAllowed) {
    throw new BlockedOutboundError('The destination must be an https:// URL.')
  }

  if (url.username !== '' || url.password !== '') {
    throw new BlockedOutboundError('The destination must not carry a username or password.')
  }

  const host = bareHost(url)
  if (!policy.allowPrivateHosts && isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new BlockedOutboundError('The destination points at a private or internal address.')
  }

  return url
}

function pinnedLookup(allowPrivateHosts: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(
      hostname,
      { all: true, family: options.family, hints: options.hints },
      (error, addresses) => {
        if (error) {
          callback(error, '')
          return
        }

        const allowed = addresses.filter(
          (candidate) => allowPrivateHosts || !isBlockedAddress(candidate.address),
        )
        if (allowed.length === 0) {
          callback(
            new BlockedOutboundError('The destination resolves to a private or internal address.'),
            '',
          )
          return
        }

        if (options.all) {
          callback(null, allowed)
          return
        }

        const first = allowed[0]!
        callback(null, first.address, first.family)
      },
    )
  }
}

export interface OutboundRequest {
  readonly url: URL
  readonly method: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | Uint8Array
  readonly timeoutMs: number
  readonly allowPrivateHosts: boolean
}

export interface OutboundResponse {
  readonly status: number
  readonly diagnostic: string
}

export function guardedRequest(request: OutboundRequest): Promise<OutboundResponse> {
  return new Promise<OutboundResponse>((resolve, reject) => {
    const isHttps = request.url.protocol === 'https:'
    const send = isHttps ? httpsRequest : httpRequest
    const payload =
      typeof request.body === 'string'
        ? Buffer.from(request.body, 'utf8')
        : Buffer.from(request.body)
    const host = bareHost(request.url)

    if (!request.allowPrivateHosts && isIP(host) !== 0 && isBlockedAddress(host)) {
      reject(new BlockedOutboundError('The destination points at a private or internal address.'))
      return
    }

    const clientRequest = send(
      {
        protocol: request.url.protocol,
        hostname: host,
        port: request.url.port === '' ? (isHttps ? 443 : 80) : Number(request.url.port),
        path: `${request.url.pathname}${request.url.search}`,
        method: request.method,
        headers: { ...request.headers, 'content-length': String(payload.length) },
        lookup: pinnedLookup(request.allowPrivateHosts),
        timeout: request.timeoutMs,
      },
      (response) => {
        let diagnostic = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          if (diagnostic.length < 200) diagnostic += chunk
        })
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, diagnostic: diagnostic.slice(0, 200) }),
        )
        response.on('error', reject)
      },
    )

    clientRequest.on('timeout', () => {
      clientRequest.destroy(new Error('The outbound request timed out.'))
    })
    clientRequest.on('error', reject)
    clientRequest.end(payload)
  })
}
