import { retentionCutoff } from '@meith/analytics'
import { PostgresAnalyticsRepository, PostgresSettingsRepository, type Database } from '@meith/db'
import { SettingsSnapshot } from '@meith/settings'

export interface AnalyticsPruner {
  prune(): Promise<{ removed: number; retentionDays: number }>
}

export function analyticsPruner(deps: {
  readonly db: Database
  readonly now?: () => Date
}): AnalyticsPruner {
  return {
    async prune() {
      const now = (deps.now ?? (() => new Date()))()
      const stored = await new PostgresSettingsRepository(deps.db).loadAll()
      const retentionDays = SettingsSnapshot.fromOverrides(new Map(stored)).get(
        'analytics.retention_days',
      )

      const removed = await new PostgresAnalyticsRepository(deps.db).prune(
        retentionCutoff({ now, retentionDays }),
      )

      return { removed, retentionDays }
    },
  }
}
