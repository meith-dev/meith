import 'server-only'

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
import { sessionCookieName } from './cookies'
import { PATH_HEADER } from './location-header'

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

    const jar = await cookies()
    const token = jar.get(sessionCookieName(env.NODE_ENV !== 'development'))?.value
    if (token === undefined || token === '') return

    const session = await identity.locateSession(token)
    if (session === null) return

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
