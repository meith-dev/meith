import { z } from 'zod'

import { MAX_TRUSTED_PROXY_HOPS } from './client-address'

const nonEmpty = z.string().min(1)

export const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails'

const isPostgresUrl = (value: string): boolean =>
  value.startsWith('postgres://') || value.startsWith('postgresql://')

const isRedisUrl = (value: string): boolean =>
  value.startsWith('redis://') || value.startsWith('rediss://')

const databaseUrl = z.string().refine(isPostgresUrl, {
  message: 'must be a postgres:// or postgresql:// connection string',
})

const secret = z.string().min(32, 'must be at least 32 characters of high-entropy random data')

const redisUrl = z.string().refine(isRedisUrl, {
  message: 'must be a redis:// or rediss:// connection string',
})

export const VERCEL_REDIS_URL_SOURCES = ['KV_URL', 'UPSTASH_REDIS_URL'] as const

export const VERCEL_DIRECT_DATABASE_URL_SOURCES = [
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
] as const

export const VERCEL_BLOB_TOKEN_SOURCES = ['BLOB_READ_WRITE_TOKEN'] as const

export const VERCEL_BLOB_STORE_MARKERS = ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'] as const

const flag = z
  .enum(['0', '1', 'true', 'false'], { message: 'must be one of 0, 1, true or false' })
  .default('0')
  .transform((value) => value === '1' || value === 'true')

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    NEXT_PHASE: z.string().optional(),

    VERCEL: z.string().optional(),

    DATA_SOURCE: z.enum(['fixture', 'postgres']),
    DATABASE_URL: databaseUrl.optional(),

    DIRECT_DATABASE_URL: databaseUrl.optional(),

    DATABASE_POOL_MAX: z.coerce.number().int().positive().max(20).default(3),

    AUTH_SECRET: secret.optional(),
    TICK_SECRET: secret.optional(),
    CRON_SECRET: secret.optional(),

    APP_URL: z.string().url().optional(),

    QUEUE_DRIVER: z.enum(['memory', 'postgres']),
    CACHE_DRIVER: z.enum(['memory', 'next', 'redis']),
    FILESTORE_DRIVER: z.enum(['local', 's3', 'blob']).default('local'),
    MAIL_DRIVER: z.enum(['log', 'http', 'smtp']).default('log'),

    REDIS_URL: redisUrl.optional(),

    UPLOADS_DIR: nonEmpty.default('.uploads'),

    MIGRATIONS_DIR: nonEmpty.optional(),

    S3_BUCKET: nonEmpty.optional(),
    S3_REGION: nonEmpty.optional(),
    S3_ACCESS_KEY_ID: nonEmpty.optional(),
    S3_SECRET_ACCESS_KEY: nonEmpty.optional(),
    S3_ENDPOINT: z.string().url().optional(),
    S3_PUBLIC_BASE_URL: z.string().url().optional(),

    BLOB_READ_WRITE_TOKEN: nonEmpty.optional(),

    MAIL_FROM: z.string().email().optional(),
    MAIL_HTTP_ENDPOINT: z.string().url().optional(),
    MAIL_HTTP_TOKEN: nonEmpty.optional(),

    RESEND_API_KEY: nonEmpty.optional(),

    MAIL_SMTP_HOST: nonEmpty.optional(),
    MAIL_SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    MAIL_SMTP_SECURITY: z.enum(['tls', 'starttls', 'none']).optional(),
    MAIL_SMTP_USERNAME: nonEmpty.optional(),
    MAIL_SMTP_PASSWORD: nonEmpty.optional(),

    ADMIN_IP_ALLOWLIST: z.string().optional(),

    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(MAX_TRUSTED_PROXY_HOPS).default(1),

    REMOTE_IMAGES: flag,

    DEMO_MODE: flag,
    DEMO_RESET_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    METRICS_ENABLED: flag,
    METRICS_TOKEN: secret.optional(),

    OTEL_ENABLED: flag,
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.DATA_SOURCE === 'postgres' && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'is required when DATA_SOURCE=postgres',
      })
    }

    if (value.DEMO_MODE && value.DATA_SOURCE !== 'postgres') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_MODE'],
        message:
          'requires DATA_SOURCE=postgres. A demo whose visitors cannot post is ' +
          'a screenshot, and fixture mode has no write side to offer them.',
      })
    }

    if (value.QUEUE_DRIVER === 'postgres' && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'is required when QUEUE_DRIVER=postgres',
      })
    }

    if (value.CACHE_DRIVER === 'redis' && !value.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'is required when CACHE_DRIVER=redis',
      })
    }

    if (value.FILESTORE_DRIVER === 's3') {
      for (const key of [
        'S3_BUCKET',
        'S3_REGION',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'is required when FILESTORE_DRIVER=s3',
          })
        }
      }
    }

    if (value.FILESTORE_DRIVER === 'blob' && !value.BLOB_READ_WRITE_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BLOB_READ_WRITE_TOKEN'],
        message:
          'is required when FILESTORE_DRIVER=blob — a Vercel Blob store attached ' +
          'to the project publishes it under exactly this name',
      })
    }

    if (value.MAIL_DRIVER === 'http') {
      for (const key of ['MAIL_HTTP_ENDPOINT', 'MAIL_HTTP_TOKEN', 'MAIL_FROM'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'is required when MAIL_DRIVER=http',
          })
        }
      }
    }

    if (value.OTEL_ENABLED && !value.OTEL_EXPORTER_OTLP_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTEL_EXPORTER_OTLP_ENDPOINT'],
        message: 'is required when OTEL_ENABLED is set',
      })
    }

    if (
      value.METRICS_ENABLED &&
      !value.METRICS_TOKEN &&
      value.NODE_ENV === 'production' &&
      value.NEXT_PHASE !== 'phase-production-build'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['METRICS_TOKEN'],
        message:
          'is required in production when METRICS_ENABLED is set — an unauthenticated ' +
          '/api/metrics would otherwise expose task, queue and database counts to ' +
          'anyone who can reach the board.',
      })
    }

    if (value.MAIL_DRIVER === 'smtp') {
      for (const key of ['MAIL_SMTP_HOST', 'MAIL_FROM'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'is required when MAIL_DRIVER=smtp',
          })
        }
      }

      if (Boolean(value.MAIL_SMTP_USERNAME) !== Boolean(value.MAIL_SMTP_PASSWORD)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [value.MAIL_SMTP_USERNAME ? 'MAIL_SMTP_PASSWORD' : 'MAIL_SMTP_USERNAME'],
          message: 'MAIL_SMTP_USERNAME and MAIL_SMTP_PASSWORD must be set together',
        })
      }
    }

    if (value.NODE_ENV === 'production' && value.NEXT_PHASE !== 'phase-production-build') {
      if (value.QUEUE_DRIVER === 'memory') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['QUEUE_DRIVER'],
          message:
            "cannot be 'memory' in production — queued jobs would be lost on " +
            "every cold start. Use 'postgres'.",
        })
      }

      if (!value.AUTH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_SECRET'],
          message: 'is required in production',
        })
      }

      if (!value.TICK_SECRET && !value.CRON_SECRET) {
        for (const name of ['TICK_SECRET', 'CRON_SECRET'] as const) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: 'is required in production unless the other one is set',
          })
        }
      }

      if (value.FILESTORE_DRIVER === 'local' && value.VERCEL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['FILESTORE_DRIVER'],
          message:
            "cannot be 'local' on Vercel — the filesystem is per-instance and " +
            'ephemeral, so uploads are lost as soon as another instance serves ' +
            'the request. Set FILESTORE_DRIVER=blob, which needs only the ' +
            'BLOB_READ_WRITE_TOKEN a Vercel Blob store publishes by itself, or ' +
            'FILESTORE_DRIVER=s3 with S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and ' +
            'S3_SECRET_ACCESS_KEY (S3_ENDPOINT too for R2, MinIO or Spaces) to ' +
            'keep the uploads somewhere you can move them from.',
        })
      }

      if (value.MAIL_DRIVER === 'smtp' && value.VERCEL && value.MAIL_SMTP_PORT === 25) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MAIL_SMTP_PORT'],
          message:
            'cannot be 25 on Vercel — serverless egress blocks the plain SMTP ' +
            'port, so every message would hang until the function timed out. ' +
            'Use 587 with MAIL_SMTP_SECURITY=starttls, or MAIL_DRIVER=http, ' +
            'which reaches a provider over ordinary HTTPS.',
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

function formatProblems(lines: readonly string[]): string {
  return [
    'Invalid environment configuration.',
    ...lines,
    '',
    'See .env.example for the full list of supported variables.',
  ].join('\n')
}

function formatIssues(error: z.ZodError): string {
  return formatProblems(
    error.issues.map((issue) => {
      const name = issue.path.join('.') || '(root)'
      return `  - ${name}: ${issue.message}`
    }),
  )
}

interface Refusal {
  readonly variable: string
  readonly message: string
}

function formatRefusals(refusals: readonly Refusal[]): string {
  return formatProblems(refusals.map(({ variable, message }) => `  - ${variable}: ${message}`))
}

interface Resolution {
  readonly value?: string
  readonly searched: readonly string[]
  readonly wrongShape: readonly string[]
}

function resolve(
  source: NodeJS.ProcessEnv,
  names: readonly string[],
  usable: (value: string) => boolean,
): Resolution {
  const wrongShape: string[] = []

  for (const name of names) {
    const value = source[name]
    if (value === undefined) continue
    if (usable(value)) return { value, searched: names, wrongShape }
    wrongShape.push(name)
  }

  return { searched: names, wrongShape }
}

function searchReport({ searched, wrongShape }: Resolution, shape: string): string {
  const looked = `Looked at ${searched.join(', ')}`

  if (wrongShape.length === 0) {
    return searched.length === 1
      ? `${looked}, which is not set.`
      : `${looked} — none of them is set.`
  }

  const set = wrongShape.join(', ')
  return wrongShape.length === 1
    ? `${looked} — ${set} is set but does not hold ${shape}.`
    : `${looked} — ${set} are set but neither holds ${shape}.`
}

const REDIS_SHAPE = 'a redis:// or rediss:// URL'

const POSTGRES_SHAPE = 'a postgres:// or postgresql:// URL'

const cacheDriverRefusal = (redis: Resolution): string =>
  'cannot be derived on Vercel: no Redis connection string was found. ' +
  `${searchReport(redis, REDIS_SHAPE)} KV_REST_API_URL is deliberately not among ` +
  'them: it is an HTTPS REST endpoint, not a Redis connection string, and a Redis ' +
  'client given it fails at connect time as though the network were broken. Attach ' +
  'a Redis store to the project, or copy its redis:// or rediss:// string into ' +
  'REDIS_URL, which is read before any of the names above. Set CACHE_DRIVER=next to ' +
  'cache inside each instance instead, knowing that every instance then serves its ' +
  'own copy for up to a minute.'

const redisUrlRefusal = (redis: Resolution): string =>
  'is required when CACHE_DRIVER=redis and cannot be derived on Vercel. ' +
  `${searchReport(redis, REDIS_SHAPE)} Attach a Redis store to the project, or set ` +
  'REDIS_URL yourself.'

const S3_INSTEAD =
  'Or set FILESTORE_DRIVER=s3 with S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and ' +
  'S3_SECRET_ACCESS_KEY. FILESTORE_DRIVER=local is not the answer here: it writes ' +
  'uploads to an instance filesystem that is discarded with the instance.'

const filestoreDriverRefusal = (blob: Resolution, linked: boolean): string =>
  (linked
    ? 'cannot be derived on Vercel: a Blob store is attached to the ' +
      `project — ${VERCEL_BLOB_STORE_MARKERS.join(' or ')} is set — but no ` +
      `read-write token is published with it. ${searchReport(blob, 'a token')} ` +
      'Create a read-write token on the store (Storage, then the store, then its ' +
      'tokens), add it to the project as BLOB_READ_WRITE_TOKEN, and redeploy: the ' +
      'store id alone cannot write an upload, and a board that took it for one ' +
      'would boot and then fail on the first attachment. '
    : 'cannot be derived on Vercel: no object store was found. ' +
      `${searchReport(blob, 'a token')} A Vercel Blob store attached to the project ` +
      'publishes that name into it. Attach one. ') + S3_INSTEAD

const directDatabaseUrlRefusal = (direct: Resolution): string =>
  'cannot be derived on Vercel. ' +
  `${searchReport(direct, POSTGRES_SHAPE)} Neon publishes the direct string under ` +
  'both of those names; POSTGRES_URL and POSTGRES_PRISMA_URL are the pooled ones and ' +
  'cannot stand in for it, because a transaction-mode pooler cannot hold the ' +
  'session-level advisory lock migrations and the installer take. Attach the ' +
  'database to the project, or set DIRECT_DATABASE_URL yourself. If DATABASE_URL is ' +
  'already the direct (non-pooler) string, set this to that same value.'

interface Derived {
  readonly env: NodeJS.ProcessEnv
  readonly refusals: readonly Refusal[]
}

function withDerivedDefaults(source: NodeJS.ProcessEnv): Derived {
  const hasDb = Boolean(source.DATABASE_URL)
  const dataSource = source.DATA_SOURCE ?? (hasDb ? 'postgres' : 'fixture')

  const ownMailApi = source.MAIL_HTTP_ENDPOINT !== undefined || source.MAIL_HTTP_TOKEN !== undefined
  const bridgedKey = ownMailApi ? undefined : source.RESEND_API_KEY

  const onVercel = Boolean(source.VERCEL) && source.NEXT_PHASE !== 'phase-production-build'
  const refusals: Refusal[] = []

  const redis = resolve(source, VERCEL_REDIS_URL_SOURCES, isRedisUrl)
  const redisUrl = source.REDIS_URL ?? (onVercel ? redis.value : undefined)

  let cacheDriver = source.CACHE_DRIVER
  if (onVercel && cacheDriver === undefined) {
    if (redisUrl === undefined) {
      refusals.push({ variable: 'CACHE_DRIVER', message: cacheDriverRefusal(redis) })
    } else {
      cacheDriver = 'redis'
    }
  }
  if (onVercel && cacheDriver === 'redis' && redisUrl === undefined) {
    refusals.push({ variable: 'REDIS_URL', message: redisUrlRefusal(redis) })
  }

  let filestoreDriver = source.FILESTORE_DRIVER
  if (onVercel && filestoreDriver === undefined) {
    const blob = resolve(source, VERCEL_BLOB_TOKEN_SOURCES, () => true)
    if (blob.value === undefined) {
      const linked = VERCEL_BLOB_STORE_MARKERS.some((name) => source[name] !== undefined)
      refusals.push({ variable: 'FILESTORE_DRIVER', message: filestoreDriverRefusal(blob, linked) })
    } else {
      filestoreDriver = 'blob'
    }
  }

  let directDatabaseUrl = source.DIRECT_DATABASE_URL
  if (onVercel && hasDb && directDatabaseUrl === undefined) {
    const direct = resolve(source, VERCEL_DIRECT_DATABASE_URL_SOURCES, isPostgresUrl)
    directDatabaseUrl = direct.value
    if (directDatabaseUrl === undefined) {
      refusals.push({ variable: 'DIRECT_DATABASE_URL', message: directDatabaseUrlRefusal(direct) })
    }
  }

  return {
    env: {
      ...source,
      DATA_SOURCE: dataSource,
      QUEUE_DRIVER: source.QUEUE_DRIVER ?? (dataSource === 'postgres' ? 'postgres' : 'memory'),
      CACHE_DRIVER: cacheDriver ?? (dataSource === 'postgres' ? 'next' : 'memory'),
      FILESTORE_DRIVER: filestoreDriver,
      ...(redisUrl === undefined ? {} : { REDIS_URL: redisUrl }),
      ...(directDatabaseUrl === undefined ? {} : { DIRECT_DATABASE_URL: directDatabaseUrl }),
      ...(bridgedKey === undefined
        ? {}
        : { MAIL_HTTP_TOKEN: bridgedKey, MAIL_HTTP_ENDPOINT: RESEND_EMAILS_ENDPOINT }),
      MAIL_DRIVER:
        source.MAIL_DRIVER ??
        (bridgedKey !== undefined && source.MAIL_FROM !== undefined ? 'http' : undefined),
    },
    refusals,
  }
}

interface LoadOptions {
  readonly ignoreBuildPhase?: boolean
}

function withoutEmptyValues(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept: NodeJS.ProcessEnv = { ...source }
  for (const [key, value] of Object.entries(kept)) {
    if (typeof value === 'string' && value.trim() === '') delete kept[key]
  }
  return kept
}

function load(rawSource: NodeJS.ProcessEnv, options: LoadOptions = {}): Env {
  const given = withoutEmptyValues(rawSource)
  if (options.ignoreBuildPhase) delete given.NEXT_PHASE

  const { env: source, refusals } = withDerivedDefaults(given)

  if (refusals.length > 0) {
    throw new Error(formatRefusals(refusals))
  }

  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    throw new Error(formatIssues(parsed.error))
  }

  return parsed.data
}

export function parseEnv(source: NodeJS.ProcessEnv, options: LoadOptions = {}): Env {
  return load(source, options)
}

let cached: Env | undefined

export function assertEnv(): Env {
  if (!cached) {
    // biome-ignore lint/style/noProcessEnv: this module is the sanctioned reader
    cached = load(process.env)
  }
  return cached
}

export function assertRuntimeEnv(): Env {
  // biome-ignore lint/style/noProcessEnv: this module is the sanctioned reader
  const validated = load(process.env, { ignoreBuildPhase: true })
  cached ??= validated
  return cached
}

const PLUGIN_ENV_NAME = /^[A-Z][A-Z0-9_]{2,63}$/

/**
 * The one door through which a plugin setting's `env` override is read. It
 * lives here because this module is the sanctioned reader of `process.env` —
 * a plugin never touches the environment itself; the host resolves the
 * variable the plugin *declared* and hands over the value.
 */
export function readPluginEnv(name: string): string | undefined {
  if (!PLUGIN_ENV_NAME.test(name)) return undefined
  // biome-ignore lint/style/noProcessEnv: this module is the sanctioned reader
  const value = process.env[name]
  return value === undefined || value === '' ? undefined : value
}

export const env: Env = new Proxy({} as Env, {
  get: (_target, prop: string) => assertEnv()[prop as keyof Env],
  has: (_target, prop: string) => prop in assertEnv(),
  ownKeys: () => Reflect.ownKeys(assertEnv()),
  getOwnPropertyDescriptor: (_target, prop) => Reflect.getOwnPropertyDescriptor(assertEnv(), prop),
})

export function resetEnvForTests(): void {
  cached = undefined
}

export const isProduction = (): boolean => assertEnv().NODE_ENV === 'production'
export const isTest = (): boolean => assertEnv().NODE_ENV === 'test'
export const isDemoMode = (): boolean => assertEnv().DEMO_MODE
