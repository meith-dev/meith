import 'server-only'

/**
 * F70 at the app layer.
 *
 * The screen's reason for existing is one question: **is the tick running?**
 * Every catch-up operation on this board — expiring bans, sending digests,
 * reconciling counters, sweeping orphaned uploads, delivering queued mail —
 * happens on it, and none of them *fail* when it stops. They simply do not
 * happen, and the board looks entirely normal until somebody notices a ban that
 * should have expired weeks ago.
 *
 * The verdict comes from `@meith/tasks`, not from here: how late is too late is
 * a domain judgement, and the screen, the CLI and any future alerting have to
 * agree.
 */
import { ForbiddenError } from '@meith/core'
import { assessScheduler, type SchedulerHealth } from '@meith/tasks'
import {
  PostgresCounterRecount,
  PostgresMaintenanceRepository,
  PostgresSearchRepository,
  PostgresSystemHealthRepository,
  getDb,
  type BoardVolumes,
  type RecountStateRow,
  type TaskRunRow,
} from '@meith/db'

import { getContainer } from './container'

export function systemHealthRepository(): PostgresSystemHealthRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresSystemHealthRepository(getDb())
    : null
}

export function requireMaintenance(): PostgresMaintenanceRepository {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so there is nothing to maintain.',
    )
  }
  return new PostgresMaintenanceRepository(getDb())
}

export function requireRecount(): PostgresCounterRecount {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so its counters are not stored.',
    )
  }
  return new PostgresCounterRecount(getDb())
}

export interface SystemHealthView {
  /** F72's index coverage. Pending is what a backfill still has to do. */
  readonly searchIndex: { readonly indexed: number; readonly pending: number }
  readonly scheduler: SchedulerHealth
  readonly runs: readonly TaskRunRow[]
  readonly recount: readonly RecountStateRow[]
  readonly volumes: BoardVolumes
  readonly prunableSessions: number
}

export async function buildSystemHealthView(now: Date): Promise<SystemHealthView | null> {
  const repository = systemHealthRepository()
  if (repository === null) return null

  const maintenance = new PostgresMaintenanceRepository(getDb())
  const [tasks, runs, recount, volumes, prunableSessions, searchIndex] = await Promise.all([
    repository.taskHealth(),
    repository.recentRuns(20),
    repository.recountState(),
    repository.volumes(),
    maintenance.countPrunableSessions(now),
    new PostgresSearchRepository(getDb()).indexProgress(),
  ])

  return {
    scheduler: assessScheduler(tasks, now),
    searchIndex,
    runs,
    recount,
    volumes,
    prunableSessions,
  }
}
