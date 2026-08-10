import 'server-only'

import { createHash } from 'node:crypto'

import { cookies, headers } from 'next/headers'

import type { Actor } from '@meith/authorization'
import { contentScopeFrom, env } from '@meith/core'
import {
  PostgresPresenceRepository,
  getDb,
  type OnlineScope,
  type OnlineSnapshot,
} from '@meith/db'

import { getContainer } from './container'
import {
  GUEST_COOKIE_DAYS,
  clearedCookie,
  guestCookieName,
  sessionCookieName,
} from './cookies'
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
  } catch {
    /* ignore */
  }
}

export function presenceRepository(): PostgresPresenceRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresPresenceRepository(getDb())
    : null
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
  } catch {
    /* ignore */
  }
}

/**
 * The guest token, but only once the client has proved it keeps cookies.
 *
 * The freshness header is the proof, and it has to come from the middleware
 * because nothing downstream can supply it: Next reflects a cookie set on a
 * `NextResponse.next()` into the request the render sees, so on a first-ever
 * visit both `cookies()` and the raw `Cookie` header already carry a token the
 * client has never seen. Counting on that wrote one presence row per request
 * from anything that discards cookies — measured at twelve rows from twelve
 * crawler requests, and a sessions table that grows without bound.
 */
async function returnedGuestToken(secure: boolean): Promise<string | undefined> {
  if ((await headers()).get(FRESH_GUEST_HEADER) === '1') return undefined

  const value = (await cookies()).get(guestCookieName(secure))?.value
  return value === '' ? undefined : value
}

/**
 * The same reader, one row.
 *
 * Only reached when there is no usable member session, which is what keeps a
 * logged-in member from being counted twice — and signing in drops the guest
 * row outright, so the two never overlap.
 */
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

/**
 * Retires the guest identity of somebody who has just become a member.
 *
 * Called wherever a session cookie is set, rather than only at the login form,
 * because that is every route into being signed in — the form, the remember-me
 * resume, and a password change that reissues the session.
 */
export async function retireGuestPresence(): Promise<void> {
  try {
    const secure = env.NODE_ENV !== 'development'
    const jar = await cookies()
    const token = jar.get(guestCookieName(secure))?.value

    if (token !== undefined && token !== '') {
      await presenceRepository()?.dropGuest(
        createHash('sha256').update(token).digest('hex'),
      )
    }

    jar.set(guestCookieName(secure), '', clearedCookie(secure))
  } catch {
    /* ignore */
  }
}

export async function onlineScopeFor(actor: Actor): Promise<OnlineScope> {
  const { authorizer } = getContainer()
  const staff =
    actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    forumIds: await authorizer.forumIdsWhere(actor, 'thread.view'),
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
