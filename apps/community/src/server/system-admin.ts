import { msg } from '@meith/i18n'
import 'server-only'

import { ForbiddenError } from '@meith/core'
import {
  type BoardVolumes,
  getDb,
  PostgresCounterRecount,
  PostgresMaintenanceRepository,
  PostgresSearchRepository,
  PostgresSystemHealthRepository,
  type RecountStateRow,
  type TaskRunRow,
} from '@meith/db'
import { assessScheduler, type SchedulerHealth, type TaskHealth } from '@meith/tasks'

import { getContainer } from './container'
import { assessMailReadiness, type MailReadiness } from './mail-health'

export function systemHealthRepository(): PostgresSystemHealthRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresSystemHealthRepository(getDb())
    : null
}

export function requireMaintenance(): PostgresMaintenanceRepository {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-6'))
  }
  return new PostgresMaintenanceRepository(getDb())
}

export function requireRecount(): PostgresCounterRecount {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-7'))
  }
  return new PostgresCounterRecount(getDb())
}

export interface SystemHealthView {
  readonly searchIndex: { readonly indexed: number; readonly pending: number }
  readonly scheduler: Omit<SchedulerHealth, 'tasks'> & {
    readonly tasks: readonly (TaskHealth & {
      readonly titleKey?: string
      readonly descriptionKey?: string
    })[]
  }
  readonly mail: MailReadiness
  readonly runs: readonly TaskRunRow[]
  readonly recount: readonly RecountStateRow[]
  readonly volumes: BoardVolumes
  readonly prunableSessions: number
}

export async function buildSystemHealthView(now: Date): Promise<SystemHealthView | null> {
  const repository = systemHealthRepository()
  if (repository === null) return null

  const maintenance = new PostgresMaintenanceRepository(getDb())
  const [tasks, runs, recount, volumes, prunableSessions, searchIndex, mail] = await Promise.all([
    repository.taskHealth(),
    repository.recentRuns(20),
    repository.recountState(),
    repository.volumes(),
    maintenance.countPrunableSessions(now),
    new PostgresSearchRepository(getDb()).indexProgress(),
    assessMailReadiness(),
  ])

  const scheduler = assessScheduler(tasks, now)
  const taskMessages = new Map(
    (getContainer().scheduler?.tasks ?? []).map((task) => [
      task.id,
      { titleKey: task.titleKey, descriptionKey: task.descriptionKey },
    ]),
  )

  return {
    scheduler: {
      ...scheduler,
      tasks: scheduler.tasks.map((task) => ({ ...task, ...taskMessages.get(task.key) })),
    },
    searchIndex,
    mail,
    runs,
    recount,
    volumes,
    prunableSessions,
  }
}
