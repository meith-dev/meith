import 'server-only'

/**
 * F73 — a stable, opaque identity for a guest.
 *
 * Guests need one for two things: paging their own stored search, and being
 * rate-limited individually rather than as a single shared bucket — which would
 * let one visitor lock every other visitor out of search, a denial of service
 * wearing a rate limit's clothes.
 *
 * The **hash** of the session cookie, never the cookie. `searches` exists to be
 * pruned, listed and read by operators; putting a live credential in it would
 * make every one of those a credential disclosure. A hash is enough for both
 * jobs, because both only ever compare it to itself.
 */
import { createHash } from 'node:crypto'

import { cookies } from 'next/headers'
import { env } from '@forum/core'

import { sessionCookieName } from './cookies'

export async function currentSessionKey(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(sessionCookieName(env.NODE_ENV !== 'development'))?.value
  if (token === undefined || token === '') return null

  return createHash('sha256').update(token).digest('base64url').slice(0, 32)
}
