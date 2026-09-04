export interface TaskContext {
  now: Date
  lastRunAt: Date | null
  elapsedSeconds: number
  signal: AbortSignal
}

export interface TaskResult {
  detail?: Record<string, number | string>
}

export interface TaskDefinition {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly titleKey?: string
  readonly descriptionKey?: string
  readonly intervalSeconds: number
  readonly schedule?: string
  readonly lane?: 'long'
  readonly maxDurationSeconds: number
  run(context: TaskContext): Promise<TaskResult>
}

export interface TaskRunRecord {
  taskId: string
  startedAt: Date
  finishedAt: Date | null
  success: boolean | null
  detail: Record<string, unknown> | null
  error: string | null
}
