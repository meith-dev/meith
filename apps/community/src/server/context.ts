import 'server-only'

import { cookies } from 'next/headers'
import { cache } from 'react'

import type { Actor } from '@meith/authorization'
import { env } from '@meith/core'

import { getContainer } from './container'
import { sessionCookieName } from './cookies'

export const getActor = cache(async (): Promise<Actor> => {
  const { identity, actorSource } = getContainer()

  const jar = await cookies()
  const token = jar.get(sessionCookieName(env.NODE_ENV !== 'development'))?.value

  if (token) {
    const resolved = await identity.resolveSession(token)
    if (resolved) {
      const actor = await actorSource.buildForUser(resolved.userId)
      if (actor) return actor
    }
  }

  return actorSource.buildGuest()
})

export const getUserId = cache(async (): Promise<number | null> => {
  const actor = await getActor()
  return actor.userId
})
