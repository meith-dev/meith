import 'server-only'

import { headers } from 'next/headers'

import { truncateIp } from '@meith/core'

import { remoteAddress } from './admin'

export interface RequestFingerprint {
  readonly ipPrefix: string | null
  readonly userAgent: string | null
}

/** Where a request came from and what made it, as much as is kept about either. */
export async function requestFingerprint(): Promise<RequestFingerprint> {
  const incoming = await headers()
  const agent = incoming.get('user-agent') ?? ''

  return {
    ipPrefix: truncateIp(await remoteAddress()) ?? null,
    userAgent: agent.trim() === '' ? null : agent.slice(0, 300),
  }
}
