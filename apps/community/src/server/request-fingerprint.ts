import 'server-only'

import { headers } from 'next/headers'

import { env, logger, resolveClientAddress, truncateIp } from '@meith/core'
import { demoAddressToken, demoDiscardsAddresses } from '@meith/demo'

export interface RequestFingerprint {
  readonly ipPrefix: string | null
  readonly userAgent: string | null
}

let announcedUntrustedForwarding = false

export async function remoteAddress(): Promise<string | null> {
  const jar = await headers()
  const forwarded = jar.get('x-forwarded-for')

  if (env.TRUSTED_PROXY_HOPS === 0 && forwarded !== null && !announcedUntrustedForwarding) {
    announcedUntrustedForwarding = true
    logger({ module: 'request' }).warn(
      'TRUSTED_PROXY_HOPS is 0 and a request arrived carrying X-Forwarded-For; ' +
        'the header is being ignored. Set it to the number of proxies in front ' +
        'of the board, or addresses will not resolve.',
    )
  }

  return resolveClientAddress(
    { forwardedFor: forwarded, realIp: jar.get('x-real-ip') },
    env.TRUSTED_PROXY_HOPS,
  )
}

export async function retainedIpPrefix(): Promise<string | null> {
  if (demoDiscardsAddresses()) return null
  return truncateIp(await remoteAddress()) ?? null
}

export async function countingPrefix(): Promise<string | null> {
  const address = await remoteAddress()
  if (address === null || address === '') return null

  const prefix = truncateIp(address)
  if (prefix === undefined) return null

  return demoDiscardsAddresses() ? demoAddressToken(prefix) : prefix
}

export async function countingAddress(): Promise<string | null> {
  const address = await remoteAddress()
  if (address === null || address === '') return null

  return demoDiscardsAddresses() ? demoAddressToken(address) : address
}

export async function requestFingerprint(): Promise<RequestFingerprint> {
  const incoming = await headers()
  const agent = incoming.get('user-agent') ?? ''

  return {
    ipPrefix: await retainedIpPrefix(),
    userAgent: agent.trim() === '' ? null : agent.slice(0, 300),
  }
}
