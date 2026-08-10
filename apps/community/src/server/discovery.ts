import 'server-only'

import type { Actor } from '@meith/authorization'
import { ForbiddenError, contentScopeFrom } from '@meith/core'
import {
  PostgresDiscoveryRepository,
  getDb,
  type DiscoveryPage,
  type DiscoveryScope,
} from '@meith/db'

import { getContainer } from './container'

export const DISCOVER_PAGE = 20

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
    forumIds: await authorizer.forumIdsWhere(actor, 'thread.view'),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
    viewerUserId: actor.userId,
  }
}

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
      return repo.activeSince(new Date(input.now.getTime() - 86_400_000), query, scope)
  }
}

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

    const local = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`)
    const offset = local.getTime() - zonedInstant(local, timeZone)
    return new Date(local.getTime() + offset)
  } catch {
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
