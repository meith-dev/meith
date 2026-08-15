import 'server-only'

import { headers } from 'next/headers'

import { NONCE_HEADER } from './location-header'

export async function cspNonce(): Promise<string | undefined> {
  try {
    return (await headers()).get(NONCE_HEADER) ?? undefined
  } catch {
    return undefined
  }
}
