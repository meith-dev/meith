import 'server-only'

import { createHash } from 'node:crypto'

import { cookies, headers } from 'next/headers'

import type { Actor } from '@meith/authorization'
import { contentScopeFrom, env } from '@meith/core'
import { getDb, type OnlineScope, type OnlineSnapshot, PostgresPresenceRepository } from '@meith/db'

import { getContainer } from './container'
import { clearedCookie, GUEST_COOKIE_DAYS, guestCookieName, sessionCookieName } from './cookies'
import { FRESH_GUEST_HEADER, PATH_HEADER } from './location-header'

const LOCATION_WINDOW_SECONDS = 60

export interface BoardLocation {
  readonly path: string
  readonly forumId: number | null
  readonly threadId: number | null
}

export function parseLocation(path: string | null): BoardLocation | null {
  if (path === null || path === '') return null

  const clean = path.split('?')[0] ?? path

  const forum = /^\/(\d+)(?:-|\/|$)/.exec(clean)
  const thread = /^\/thread\/(\d+)-/.exec(clean)

  return {
    path: clean,
    forumId: forum === null ? null : Number(forum[1]),
    threadId: thread === null ? null : Number(thread[1]),
  }
}

export async function touchCurrentLocation(): Promise<void> {
  try {
    const location = parseLocation((await headers()).get(PATH_HEADER))
    if (location === null) return
    await touchLocation(location)
  } catch {}
}

export function presenceRepository(): PostgresPresenceRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresPresenceRepository(getDb()) : null
}

export async function touchLocation(location: BoardLocation): Promise<void> {
  try {
    const { identity, accountStore } = getContainer()
    const secure = env.NODE_ENV !== 'development'

    const jar = await cookies()
    const token = jar.get(sessionCookieName(secure))?.value

    if (token === undefined || token === '') {
      await touchGuestLocation(await returnedGuestToken(secure), location)
      return
    }

    const session = await identity.locateSession(token)
    if (session === null) {
      await touchGuestLocation(await returnedGuestToken(secure), location)
      return
    }

    await accountStore.sessions.touchLocation(
      session.sessionId,
      {
        path: location.path,
        forumId: location.forumId,
        threadId: location.threadId,
      },
      new Date(),
      LOCATION_WINDOW_SECONDS,
    )
  } catch {}
}

async function returnedGuestToken(secure: boolean): Promise<string | undefined> {
  if ((await headers()).get(FRESH_GUEST_HEADER) === '1') return undefined

  const value = (await cookies()).get(guestCookieName(secure))?.value
  return value === '' ? undefined : value
}

async function touchGuestLocation(
  guestToken: string | undefined,
  location: BoardLocation,
): Promise<void> {
  if (guestToken === undefined || guestToken === '') return

  const repo = presenceRepository()
  if (repo === null) return

  const now = new Date()
  await repo.touchGuest({
    tokenHash: createHash('sha256').update(guestToken).digest('hex'),
    location: {
      path: location.path,
      forumId: location.forumId,
      threadId: location.threadId,
    },
    now,
    windowSeconds: LOCATION_WINDOW_SECONDS,
    expiresAt: new Date(now.getTime() + GUEST_COOKIE_DAYS * 86_400_000),
  })
}

export async function retireGuestPresence(): Promise<void> {
  try {
    const secure = env.NODE_ENV !== 'development'
    const jar = await cookies()
    const token = jar.get(guestCookieName(secure))?.value

    if (token !== undefined && token !== '') {
      await presenceRepository()?.dropGuest(createHash('sha256').update(token).digest('hex'))
    }

    jar.set(guestCookieName(secure), '', clearedCookie(secure))
  } catch {}
}

export async function onlineScopeFor(actor: Actor): Promise<OnlineScope> {
  const { authorizer } = getContainer()
  const staff = actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    ...(await authorizer.threadAudience(actor)),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
    seesInvisible: await authorizer.can(actor, 'modcp.access'),
  }
}

export async function readOnline(actor: Actor, now: Date): Promise<OnlineSnapshot | null> {
  const repo = presenceRepository()
  if (repo === null) return null

  try {
    return await repo.onlineNow(now, await onlineScopeFor(actor))
  } catch {
    return null
  }
}
