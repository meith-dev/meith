import 'server-only'

/**
 * F75's statistics at the app layer.
 *
 * The scope is the same one search and discovery use, for the same reason: a
 * "most viewed threads" table that ranked the staff community would be a leak with
 * an ordering on it, and "which communities may this actor see" must have exactly
 * one answer on this board.
 */
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

/** How many rows each leaderboard shows. */
export const LEADERBOARD_SIZE = 10

export function statsRepository(): PostgresStatsRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresStatsRepository(getDb()) : null
}

export async function statsScopeFor(actor: Actor): Promise<StatsScope> {
  const { authorizer } = getContainer()
  const staff =
    actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    communityIds: await authorizer.communityIdsWhere(actor, 'thread.view'),
    content: contentScopeFrom({ seesUnapproved: staff, seesDeleted: staff }),
  }
}

export interface StatsView {
  readonly totals: BoardTotals
  readonly topPosters: readonly TopPoster[]
  readonly mostViewed: readonly TopThread[]
  readonly mostReplied: readonly TopThread[]
}

/**
 * Everything the statistics page shows.
 *
 * Four reads, run together: they are independent, and the page cannot render
 * until all four are back, so serialising them would add three round trips to
 * a page nobody is waiting for anything else on.
 */
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

/**
 * The board's totals for the index panel.
 *
 * A separate, single read rather than `buildStatsView`: the panel shows four
 * numbers, and the index is the most-requested page on the board — running
 * three leaderboards to render a line of totals would be the sort of cost
 * nobody notices until the board is busy.
 *
 * Swallows to null, because the index must render when this does not.
 */
export async function readTotals(): Promise<BoardTotals | null> {
  const repo = statsRepository()
  if (repo === null) return null

  try {
    return await repo.readTotals()
  } catch {
    return null
  }
}
