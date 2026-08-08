import 'server-only'

/**
 * F74 at the app layer.
 *
 * Four views, one scope, one paging shape. The scope is F72's — built from
 * `Authorizer.communityIdsWhere` and a `ContentScope` — because "which communities may
 * this actor see" has exactly one right answer and search already asks it.
 */
import type { Actor } from '@meith/authorization'
import { ForbiddenError, contentScopeFrom } from '@meith/core'
import {
  PostgresDiscoveryRepository,
  getDb,
  type DiscoveryPage,
  type DiscoveryScope,
} from '@meith/db'

import { getContainer } from './container'

/** Threads per page. */
export const DISCOVER_PAGE = 20

/** The views this feature offers, and what each one asks. */
export const DISCOVERY_VIEWS = ['new', 'today', 'mine', 'participated', 'unanswered'] as const
export type DiscoveryView = (typeof DISCOVERY_VIEWS)[number]

export function isDiscoveryView(value: string): value is DiscoveryView {
  return (DISCOVERY_VIEWS as readonly string[]).includes(value)
}

export function discoveryRepository(): PostgresDiscoveryRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresDiscoveryRepository(getDb())
    : null
}

export async function discoveryScopeFor(actor: Actor): Promise<DiscoveryScope> {
  const { authorizer } = getContainer()
  const staff =
    actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    communityIds: await authorizer.communityIdsWhere(actor, 'thread.view'),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
    viewerUserId: actor.userId,
  }
}

/**
 * Run one view.
 *
 * The two personal views need a signed-in member, and saying so is better than
 * quietly returning nothing: "no threads" and "you are not signed in" look
 * identical on screen and lead to completely different next actions.
 */
export async function runDiscovery(input: {
  readonly actor: Actor
  readonly view: DiscoveryView
  readonly now: Date
  readonly timeZone: string
  readonly after: DiscoveryPage['nextCursor']
}): Promise<DiscoveryPage> {
  const repo = discoveryRepository()
  if (repo === null) throw new ForbiddenError('This board has no thread index.')

  const scope = await discoveryScopeFor(input.actor)
  const query = { limit: DISCOVER_PAGE, after: input.after }

  switch (input.view) {
    case 'today':
      return repo.activeSince(startOfDay(input.now, input.timeZone), query, scope)
    case 'unanswered':
      return repo.unanswered(query, scope)
    case 'mine':
      if (input.actor.userId === null) throw new ForbiddenError('Sign in to see your threads.')
      return repo.startedBy(input.actor.userId, query, scope)
    case 'participated':
      if (input.actor.userId === null) throw new ForbiddenError('Sign in to see your threads.')
      return repo.participatedIn(input.actor.userId, query, scope)
    case 'new':
    default:
      /*
       * "New" is the last day rather than "since your last visit", and that is a
       * deliberate limit rather than an oversight: a real "since last visit"
       * needs the read state F32 keeps per thread, and folding it in here would
       * mean either a join per row or a second query per page. Named in the
       * F74 row; the day window is what MyBB's "today's posts" effectively is
       * and is honest about what it shows.
       */
      return repo.activeSince(new Date(input.now.getTime() - 86_400_000), query, scope)
  }
}

/**
 * Midnight in the viewer's zone, as an instant.
 *
 * "Today" means the viewer's today (F57 gave members a timezone), not the
 * server's — a member in Auckland asking at 9am must not be shown the previous
 * day because the server is in London.
 */
export function startOfDay(now: Date, timeZone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)

    const get = (type: string): string =>
      parts.find((part) => part.type === type)?.value ?? '01'

    /*
     * Built by measuring the zone's offset at this instant rather than by
     * string arithmetic, so it is correct across a daylight-saving boundary —
     * the one day a year when "midnight" is not 24 hours after the last one.
     */
    const local = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`)
    const offset = local.getTime() - zonedInstant(local, timeZone)
    return new Date(local.getTime() + offset)
  } catch {
    /* An unknown zone is a member's stored preference, not a reason to fail. */
    return new Date(now.getTime() - 86_400_000)
  }
}

function zonedInstant(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00'
  return Date.parse(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}:${get('second')}Z`,
  )
}
