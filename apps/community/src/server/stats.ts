import 'server-only'

import type { Actor } from '@meith/authorization'
import { contentScopeFrom } from '@meith/core'
import {
  type BoardTotals,
  getDb,
  PostgresStatsRepository,
  type StatsScope,
  type TopPoster,
  type TopThread,
} from '@meith/db'

import { getContainer } from './container'
import { FixtureActivityRepository } from './fixture-activity-repo'

export const LEADERBOARD_SIZE = 10

export function statsRepository(): PostgresStatsRepository | FixtureActivityRepository {
  return getContainer().dataSource === 'postgres'
    ? new PostgresStatsRepository(getDb())
    : new FixtureActivityRepository()
}

export async function statsScopeFor(actor: Actor): Promise<StatsScope> {
  const { authorizer } = getContainer()
  const staff = actor.global.isAdministrator === true || actor.global.isSuperModerator === true

  return {
    ...(await authorizer.threadAudience(actor)),
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

  try {
    return await repo.readTotals()
  } catch {
    return null
  }
}
