import 'server-only'

/**
 * F75 at the app layer — recording where somebody is, and reading who is here.
 *
 * ## The writer F17 built and nothing called
 *
 * `sessions.location_path`, `location_community_id` and `location_thread_id` have
 * been in the schema since `0000`, and `touchLocation` — a conditional UPDATE
 * whose throttle *is* its `where` clause — since F17. Neither had a caller.
 * This is it, and it goes in the page shell beside `touchActivity` for the same
 * reason: the shell is the one place every reading page passes through.
 *
 * ## What a location may say
 *
 * The **path** the visitor is on, and the community and thread ids if the route has
 * them. Never a title, and never a query string: a stored search's token, a
 * filter, or a moderation queue's parameters are not things to put in a table
 * that an online list reads. What the reader is then *told* is decided when the
 * list is read, against their permissions, not here.
 *
 * ## Failure is not worth a page
 *
 * Every function here swallows. A presence column is the least important thing
 * on any page it appears on, and taking a thread down because a session row
 * would not update is a trade nobody would make deliberately.
 */
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

/**
 * How long between writes of a session's location.
 *
 * Sixty seconds, as R3.1 specifies. Shorter than the fifteen-minute online
 * window for `touchActivity`'s reason: a throttle equal to the window makes
 * everybody flicker out of the list at the end of every interval.
 */
const LOCATION_WINDOW_SECONDS = 60

export interface BoardLocation {
  readonly path: string
  readonly communityId: number | null
  readonly threadId: number | null
}

/**
 * Where the visitor is, from the path the proxy passed on.
 *
 * Parsed rather than threaded through every page, and parsed here rather than
 * in the shell so it is a pure function with a test. `/community/12-news` and
 * `/thread/34-hello` are the two routes that carry an id, and both put it
 * first — which is exactly the shape the pages themselves already parse.
 *
 * An unrecognised path is a path and two nulls, not a refusal: "somewhere on
 * the board" is what the list shows for a member reading their own settings,
 * and it is true.
 */
export function parseLocation(path: string | null): BoardLocation | null {
  if (path === null || path === '') return null

  /* Defence in depth: the proxy sends no query string, and this drops one
     anyway rather than trusting a header that anything upstream could set. */
  const clean = path.split('?')[0] ?? path

  const community = /^\/community\/(\d+)-/.exec(clean)
  const thread = /^\/thread\/(\d+)-/.exec(clean)

  return {
    path: clean,
    communityId: community === null ? null : Number(community[1]),
    threadId: thread === null ? null : Number(thread[1]),
  }
}

/**
 * Record where the current request is, reading the path from the proxy.
 *
 * The shell's one call. Separate from `touchLocation` so the parsing and the
 * writing can each be tested without the other.
 */
export async function touchCurrentLocation(): Promise<void> {
  try {
    const location = parseLocation((await headers()).get(PATH_HEADER))
    if (location === null) return
    await touchLocation(location)
  } catch {
    /* Deliberately swallowed. See the header. */
  }
}

export function presenceRepository(): PostgresPresenceRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresPresenceRepository(getDb())
    : null
}

/**
 * Record where this visitor is.
 *
 * Guests included — they are most of an online list, and a board that counted
 * only members would report a fraction of its traffic. The session row exists
 * for them already (it holds the CSRF secret), so this costs no extra row.
 */
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
        communityId: location.communityId,
        threadId: location.threadId,
      },
      new Date(),
      LOCATION_WINDOW_SECONDS,
    )
  } catch {
    /* Deliberately swallowed. See the header. */
  }
}

/**
 * What this actor may be told about who is here.
 *
 * The community list is the Authorizer's, so "which communities may I be told the names
 * of" has the same answer as "which communities may I read" — one rule, one place.
 * `seesInvisible` is `modcp.access`, not a group check: a moderator needs to
 * know who is present, and an administrator is already covered by that answer.
 */
export async function onlineScopeFor(actor: Actor): Promise<OnlineScope> {
  const { authorizer } = getContainer()
  const staff =
    actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    communityIds: await authorizer.communityIdsWhere(actor, 'thread.view'),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
    seesInvisible: await authorizer.can(actor, 'modcp.access'),
  }
}

/**
 * Who is here, as this actor may see them.
 *
 * Returns null rather than an empty snapshot when there is no store, because
 * the two mean different things on screen: a board with no presence tracking
 * should render no panel at all, and "0 online" on a page somebody is reading
 * is visibly false.
 */
export async function readOnline(actor: Actor, now: Date): Promise<OnlineSnapshot | null> {
  const repo = presenceRepository()
  if (repo === null) return null

  try {
    return await repo.onlineNow(now, await onlineScopeFor(actor))
  } catch {
    return null
  }
}
