export type BackupTrigger = 'manual' | 'schedule' | 'upgrade' | 'cli'

export type BackupRunStatus = 'queued' | 'running' | 'done' | 'incomplete' | 'failed'

export interface BackupRunRecord {
  readonly id: number
  readonly trigger: BackupTrigger
  readonly status: BackupRunStatus
  readonly requestedByUserId: number | null
  readonly requestedAt: Date
  readonly startedAt: Date | null
  readonly finishedAt: Date | null
  readonly heartbeatAt: Date | null
  readonly bundleName: string | null
  readonly sizeBytes: number | null
  readonly uploads: 'included' | 'skipped' | null
  readonly shipped: boolean
  readonly skippedKeys: number
  readonly error: string | null
}

export interface BackupRunFinish {
  readonly status: 'done' | 'incomplete' | 'failed'
  readonly finishedAt: Date
  readonly bundleName?: string | null | undefined
  readonly sizeBytes?: number | null | undefined
  readonly uploads?: 'included' | 'skipped' | null | undefined
  readonly shipped?: boolean | undefined
  readonly skippedKeys?: number | undefined
  readonly error?: string | null | undefined
}

export interface BackupRunRepository {
  enqueue(input: {
    readonly trigger: BackupTrigger
    readonly requestedByUserId?: number | null | undefined
    readonly now: Date
  }): Promise<{ readonly id: number; readonly queued: boolean }>

  claimNext(now: Date): Promise<BackupRunRecord | null>

  heartbeat(id: number, now: Date): Promise<void>

  finish(id: number, outcome: BackupRunFinish): Promise<void>

  active(now: Date, staleBefore: Date): Promise<BackupRunRecord | null>

  recent(limit: number): Promise<readonly BackupRunRecord[]>

  lastScheduledAt(): Promise<Date | null>

  failInterrupted(now: Date, staleBefore: Date): Promise<number>

  record(input: {
    readonly trigger: BackupTrigger
    readonly requestedByUserId?: number | null | undefined
    readonly startedAt: Date
    readonly outcome: BackupRunFinish
  }): Promise<void>
}
