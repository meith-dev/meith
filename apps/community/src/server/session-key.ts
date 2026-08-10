import 'server-only'

import { createHash } from 'node:crypto'

import { cookies } from 'next/headers'
import { env } from '@meith/core'

import { sessionCookieName } from './cookies'

export async function currentSessionKey(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(sessionCookieName(env.NODE_ENV !== 'development'))?.value
  if (token === undefined || token === '') return null

  return createHash('sha256').update(token).digest('base64url').slice(0, 32)
}
