import 'server-only'

/**
 * The request-scoped principal (F17/F20).
 *
 * `getActor()` is the single entry point every Server Component and Server
 * Action uses to learn *who is asking*. It is wrapped in `React.cache`, so
 * within one request render it runs at most once no matter how many components
 * call it — the session lookup and group combine happen a single time and every
 * consumer shares the same `Actor`.
 *
 * This function is read-only by construction: it resolves the session cookie to
 * an actor but never writes a cookie. Remember-me rotation (which must issue a
 * fresh Set-Cookie) is therefore NOT done here — a Server Component cannot set
 * cookies. It lives in `proxy.ts`, which promotes a remember-me cookie into a
 * session cookie *before* the request reaches this layer. By the time
 * `getActor()` runs, a resumable visitor already has a session cookie.
 */
import { cache } from 'react'
import { cookies } from 'next/headers'

import type { Actor } from '@meith/authorization'
import { env } from '@meith/core'

import { getContainer } from './container'
import { sessionCookieName } from './cookies'

/**
 * Resolve the current actor. Falls back to the guest principal whenever there is
 * no valid session — an expired, forged, or absent cookie all resolve to guest,
 * never to an error, so public pages render for anonymous visitors.
 */
export const getActor = cache(async (): Promise<Actor> => {
  const { identity, actorSource } = getContainer()

  const jar = await cookies()
  const token = jar.get(sessionCookieName(env.NODE_ENV !== 'development'))?.value

  if (token) {
    const resolved = await identity.resolveSession(token)
    if (resolved) {
      const actor = await actorSource.buildForUser(resolved.userId)
      // A session pointing at a deleted/non-principal user resolves to null;
      // treat that exactly like no session — guest, not an error.
      if (actor) return actor
    }
  }

  return actorSource.buildGuest()
})

/** Convenience: the current user id, or null for a guest. */
export const getUserId = cache(async (): Promise<number | null> => {
  const actor = await getActor()
  return actor.userId
})
