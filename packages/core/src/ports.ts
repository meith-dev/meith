/**
 * Driver ports.
 *
 * These interfaces live in `@meith/core` — the bottom of the dependency graph —
 * so domain packages can depend on the *shape* of a queue or cache without
 * depending on any implementation. `@meith/drivers` provides the
 * implementations; nothing in `packages/<domain>/` may import it (enforced by
 * the `domain-no-infra-impl` boundary rule).
 */

/* ------------------------------------------------------------------ *
 * Queue
 * ------------------------------------------------------------------ */

/** A job as handed to a handler. */
export interface Job<TPayload = unknown> {
  readonly id: string
  readonly kind: string
  readonly payload: TPayload
  /** 1 on first delivery. Handlers may use this to give up gracefully. */
  readonly attempt: number
  /**
   * Request ID of whatever enqueued this job, when known. Propagated into the
   * job's log context so a failure can be traced back to the request that
   * caused it (F09).
   */
  readonly requestId?: string
}

export interface EnqueueOptions {
  /** Earliest time the job may run. Defaults to now. */
  readonly runAt?: Date
  /**
   * Delivery attempts before the job is dead-lettered. Defaults to the driver's
   * configured value.
   */
  readonly maxAttempts?: number
  /**
   * Deduplication key. A second enqueue with a live key is a no-op, which is
   * what makes "enqueue on every request" safe for things like search indexing.
   */
  readonly dedupeKey?: string
}

/**
 * At-least-once delivery. Handlers **must** be idempotent: a job can be
 * delivered twice if a worker dies between doing the work and acknowledging it,
 * and no queue can close that window.
 */
export interface QueueDriver {
  enqueue<TPayload>(
    kind: string,
    payload: TPayload,
    options?: EnqueueOptions,
  ): Promise<{ id: string; deduplicated: boolean }>

  /**
   * Claims up to `limit` due jobs and runs `handler` on each.
   *
   * Claiming must be atomic against concurrent drains — two workers, or a cron
   * tick overlapping a worker loop, must never receive the same job. Returns
   * counts so the tick can report progress.
   */
  drain(
    limit: number,
    handler: (job: Job) => Promise<void>,
  ): Promise<{ processed: number; failed: number }>

  /** Jobs that exhausted `maxAttempts`. For the admin UI and the CLI. */
  deadLettered(limit: number): Promise<readonly Job[]>

  /** Returns a dead-lettered job to the queue with a fresh attempt count. */
  retry(jobId: string): Promise<void>
}

/* ------------------------------------------------------------------ *
 * Cache
 * ------------------------------------------------------------------ */

export interface CacheSetOptions {
  /** Time to live in seconds. Omitted means "until invalidated". */
  readonly ttlSeconds?: number
  /** Tags for group invalidation. See `@meith/core/cache` for canonical names. */
  readonly tags?: readonly string[]
}

/**
 * A key/value cache.
 *
 * Deliberately has no "get or compute" method: that belongs to the caller, so
 * the read path stays visible at the call site. See the F10 harness for why
 * caching anything actor-dependent is a leak, not an optimisation.
 */
export interface CacheDriver {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>
  delete(key: string): Promise<void>
  /** Invalidates every entry carrying any of `tags`. */
  invalidateTags(tags: readonly string[]): Promise<void>
}

/* ------------------------------------------------------------------ *
 * File store
 * ------------------------------------------------------------------ */

export interface StoredFile {
  readonly key: string
  readonly size: number
  readonly contentType: string
}

export interface PutFileOptions {
  readonly contentType: string
  /**
   * Whether the object should be readable without a signed URL. Avatars are
   * public; attachments in a private community are emphatically not.
   */
  readonly visibility: 'public' | 'private'
}

export interface FileStore {
  put(key: string, body: Uint8Array, options: PutFileOptions): Promise<StoredFile>
  get(key: string): Promise<Uint8Array | undefined>
  delete(key: string): Promise<void>
  /**
   * A time-limited URL for a private object. Public objects should use `url()`.
   * Returns undefined for stores with no signing support (the local disk store),
   * so callers must be prepared to stream through the app instead.
   */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | undefined>
  /** Stable public URL. Only meaningful for `visibility: 'public'` objects. */
  url(key: string): string
}

/* ------------------------------------------------------------------ *
 * Mail
 * ------------------------------------------------------------------ */

export interface OutgoingMail {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html?: string
  readonly replyTo?: string
  /**
   * Display name for the sender, shown beside the address.
   *
   * The **address** belongs to the transport — `MAIL_FROM`, or the board's
   * `mail.from` setting when the environment does not decide (see
   * `@meith/settings/mail`) — and only the name travels with the message. That
   * split is not tidiness: the name is `mail.from_name`, which an operator can
   * change on a running board, and a worker process outlives several settings
   * changes. A name resolved once at construction would send last week's board
   * name for as long as the process lived, which is the bug `resolveMailBrand`
   * already exists to avoid for the board name inside the message.
   *
   * Absent or empty means the bare address, which is what every message sent
   * before this field existed looked like.
   */
  readonly fromName?: string
}

export interface MailDriver {
  /**
   * Hands the message to the transport.
   *
   * Should be called from a queued job, never inline in a request: an SMTP
   * timeout must not become a failed registration. Throwing here is expected
   * and drives queue retry.
   */
  send(mail: OutgoingMail): Promise<void>
}

/* ------------------------------------------------------------------ *
 * Bundle
 * ------------------------------------------------------------------ */

/**
 * Every driver, resolved once from the environment.
 *
 * Passed down explicitly rather than imported. Downstream code receives this
 * bundle and never branches on which implementation it holds — that is the
 * whole point of F05's "no conditional feature code downstream".
 */
export interface Drivers {
  readonly queue: QueueDriver
  readonly cache: CacheDriver
  readonly files: FileStore
  readonly mail: MailDriver
}
