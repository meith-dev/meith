import 'server-only'

import type { Actor } from '@meith/authorization'
import { contentScopeFrom } from '@meith/core'
import {
  PostgresStatsRepository,
  getDb,
  type BoardTotals,
  type StatsScope,
  type TopPoster,
  type TopThread,
} from '@meith/db'

import { getContainer } from './container'

export const LEADERBOARD_SIZE = 10

export function statsRepository(): PostgresStatsRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresStatsRepository(getDb()) : null
}

export async function statsScopeFor(actor: Actor): Promise<StatsScope> {
  const { authorizer } = getContainer()
  const staff =
    actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    forumIds: await authorizer.forumIdsWhere(actor, 'thread.view'),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
  }
}

export interface StatsView {
  readonly totals: BoardTotals
  readonly topPosters: readonly TopPoster[]
  readonly mostViewed: readonly TopThread[]
  readonly mostReplied: readonly TopThread[]
}

export async function buildStatsView(actor: Actor): Promise<StatsView | null> {
  const repo = statsRepository()
  if (repo === null) return null

  const scope = await statsScopeFor(actor)
  const [totals, topPosters, mostViewed, mostReplied] = await Promise.all([
    repo.readTotals(),
    repo.topPosters(LEADERBOARD_SIZE),
    repo.mostViewed(LEADERBOARD_SIZE, scope),
    repo.mostReplied(LEADERBOARD_SIZE, scope),
  ])

  return { totals, topPosters, mostViewed, mostReplied }
}

export async function readTotals(): Promise<BoardTotals | null> {
  const repo = statsRepository()
  if (repo === null) return null

  try {
    return await repo.readTotals()
  } catch {
    return null
  }
}
