export interface Job<TPayload = unknown> {
  readonly id: string
  readonly kind: string
  readonly payload: TPayload
  readonly attempt: number
  readonly requestId?: string
}

export interface EnqueueOptions {
  readonly runAt?: Date
  readonly maxAttempts?: number
  readonly dedupeKey?: string
}

export interface QueueDriver {
  enqueue<TPayload>(
    kind: string,
    payload: TPayload,
    options?: EnqueueOptions,
  ): Promise<{ id: string; deduplicated: boolean }>

  drain(
    limit: number,
    handler: (job: Job) => Promise<void>,
  ): Promise<{ processed: number; failed: number }>

  deadLettered(limit: number): Promise<readonly Job[]>

  retry(jobId: string): Promise<void>
}

export interface CacheSetOptions {
  readonly ttlSeconds?: number
  readonly tags?: readonly string[]
}

export interface CacheDriver {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>
  delete(key: string): Promise<void>
  invalidateTags(tags: readonly string[]): Promise<void>
}

export interface StoredFile {
  readonly key: string
  readonly size: number
  readonly contentType: string
}

export interface PutFileOptions {
  readonly contentType: string
  readonly visibility: 'public' | 'private'
}

export interface FileStore {
  put(key: string, body: Uint8Array, options: PutFileOptions): Promise<StoredFile>
  get(key: string): Promise<Uint8Array | undefined>
  delete(key: string): Promise<void>
  signedUrl(key: string, expiresInSeconds: number): Promise<string | undefined>
  url(key: string): string
}

export interface OutgoingMail {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html?: string
  readonly replyTo?: string
  readonly fromName?: string
}

export interface MailDriver {
  send(mail: OutgoingMail): Promise<void>
}

export interface Drivers {
  readonly queue: QueueDriver
  readonly cache: CacheDriver
  readonly files: FileStore
  readonly mail: MailDriver
}
