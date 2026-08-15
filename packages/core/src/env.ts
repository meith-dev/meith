import { z } from "zod"

import { MAX_TRUSTED_PROXY_HOPS } from "./client-address"

const nonEmpty = z.string().min(1)

const databaseUrl = z
  .string()
  .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
    message: "must be a postgres:// or postgresql:// connection string",
  })

const secret = z
  .string()
  .min(32, "must be at least 32 characters of high-entropy random data")

// Deliberately not z.coerce.boolean(), which reads "false" as true. A typo in a
// flag that disarms mail and webhooks should stop the boot, not be rounded up.
const flag = z
  .enum(["0", "1", "true", "false"], { message: "must be one of 0, 1, true or false" })
  .default("0")
  .transform((value) => value === "1" || value === "true")

const flagOn = z
  .enum(["0", "1", "true", "false"], { message: "must be one of 0, 1, true or false" })
  .default("1")
  .transform((value) => value === "1" || value === "true")

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    NEXT_PHASE: z.string().optional(),

    VERCEL: z.string().optional(),

    DATA_SOURCE: z.enum(["fixture", "postgres"]),
    DATABASE_URL: databaseUrl.optional(),

    DIRECT_DATABASE_URL: databaseUrl.optional(),

    DATABASE_POOL_MAX: z.coerce.number().int().positive().max(20).default(3),

    AUTH_SECRET: secret.optional(),
    TICK_SECRET: secret.optional(),

    APP_URL: z.string().url().optional(),

    QUEUE_DRIVER: z.enum(["memory", "postgres", "redis"]),
    CACHE_DRIVER: z.enum(["memory", "next", "redis"]),
    FILESTORE_DRIVER: z.enum(["local", "s3"]).default("local"),
    MAIL_DRIVER: z.enum(["log", "http", "smtp"]).default("log"),

    REDIS_URL: z.string().url().optional(),

    UPLOADS_DIR: nonEmpty.default(".uploads"),

    MIGRATIONS_DIR: nonEmpty.optional(),

    S3_BUCKET: nonEmpty.optional(),
    S3_REGION: nonEmpty.optional(),
    S3_ACCESS_KEY_ID: nonEmpty.optional(),
    S3_SECRET_ACCESS_KEY: nonEmpty.optional(),
    S3_ENDPOINT: z.string().url().optional(),

    MAIL_FROM: z.string().email().optional(),
    MAIL_HTTP_ENDPOINT: z.string().url().optional(),
    MAIL_HTTP_TOKEN: nonEmpty.optional(),

    MAIL_SMTP_HOST: nonEmpty.optional(),
    MAIL_SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    MAIL_SMTP_SECURITY: z.enum(["tls", "starttls", "none"]).optional(),
    MAIL_SMTP_USERNAME: nonEmpty.optional(),
    MAIL_SMTP_PASSWORD: nonEmpty.optional(),

    ADMIN_IP_ALLOWLIST: z.string().optional(),

    TRUSTED_PROXY_HOPS: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_TRUSTED_PROXY_HOPS)
      .default(1),

    REMOTE_IMAGES: flagOn,

    // A public demo board: seeded content, published credentials, and a reset on
    // a timer. It is not a lighter board — it is the whole board with the
    // outbound surfaces disarmed, because everybody who visits is an
    // administrator. See docs/demo-mode.md.
    DEMO_MODE: flag,
    DEMO_RESET_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((value, ctx) => {
    if (value.DATA_SOURCE === "postgres" && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "is required when DATA_SOURCE=postgres",
      })
    }

    if (value.DEMO_MODE && value.DATA_SOURCE !== "postgres") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEMO_MODE"],
        message:
          "requires DATA_SOURCE=postgres. A demo whose visitors cannot post is " +
          "a screenshot, and fixture mode has no write side to offer them.",
      })
    }

    if (value.QUEUE_DRIVER === "postgres" && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "is required when QUEUE_DRIVER=postgres",
      })
    }

    if ((value.QUEUE_DRIVER === "redis" || value.CACHE_DRIVER === "redis") && !value.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "is required when QUEUE_DRIVER=redis or CACHE_DRIVER=redis",
      })
    }

    if (value.FILESTORE_DRIVER === "s3") {
      for (const key of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: "is required when FILESTORE_DRIVER=s3",
          })
        }
      }
    }

    if (value.MAIL_DRIVER === "http") {
      for (const key of ["MAIL_HTTP_ENDPOINT", "MAIL_HTTP_TOKEN", "MAIL_FROM"] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: "is required when MAIL_DRIVER=http",
          })
        }
      }
    }

    if (value.MAIL_DRIVER === "smtp") {
      for (const key of ["MAIL_SMTP_HOST", "MAIL_FROM"] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: "is required when MAIL_DRIVER=smtp",
          })
        }
      }

      if (Boolean(value.MAIL_SMTP_USERNAME) !== Boolean(value.MAIL_SMTP_PASSWORD)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [value.MAIL_SMTP_USERNAME ? "MAIL_SMTP_PASSWORD" : "MAIL_SMTP_USERNAME"],
          message: "MAIL_SMTP_USERNAME and MAIL_SMTP_PASSWORD must be set together",
        })
      }
    }

    if (value.NODE_ENV === "production" && value.NEXT_PHASE !== "phase-production-build") {
      if (value.QUEUE_DRIVER === "memory") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["QUEUE_DRIVER"],
          message:
            "cannot be 'memory' in production — queued jobs would be lost on " +
            "every cold start. Use 'postgres' or 'redis'.",
        })
      }

      for (const key of ["AUTH_SECRET", "TICK_SECRET"] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: "is required in production",
          })
        }
      }

      if (value.FILESTORE_DRIVER === "local" && value.VERCEL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["FILESTORE_DRIVER"],
          message:
            "cannot be 'local' on Vercel — the filesystem is per-instance and " +
            "ephemeral, so uploads are lost as soon as another instance serves " +
            "the request. Set FILESTORE_DRIVER=s3 with S3_BUCKET, S3_REGION, " +
            "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (S3_ENDPOINT too for R2, " +
            "MinIO or Spaces).",
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join(".") || "(root)"
    return `  - ${name}: ${issue.message}`
  })
  return [
    "Invalid environment configuration.",
    ...lines,
    "",
    "See .env.example for the full list of supported variables.",
  ].join("\n")
}

function withDerivedDefaults(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const hasDb = Boolean(source.DATABASE_URL)
  const dataSource = source.DATA_SOURCE ?? (hasDb ? "postgres" : "fixture")

  return {
    ...source,
    DATA_SOURCE: dataSource,
    QUEUE_DRIVER:
      source.QUEUE_DRIVER ?? (dataSource === "postgres" ? "postgres" : "memory"),
    CACHE_DRIVER:
      source.CACHE_DRIVER ?? (dataSource === "postgres" ? "next" : "memory"),
  }
}

interface LoadOptions {
  readonly ignoreBuildPhase?: boolean
}

function withoutEmptyValues(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept: NodeJS.ProcessEnv = { ...source }
  for (const [key, value] of Object.entries(kept)) {
    if (typeof value === "string" && value.trim() === "") delete kept[key]
  }
  return kept
}

function load(rawSource: NodeJS.ProcessEnv, options: LoadOptions = {}): Env {
  const source = withDerivedDefaults(withoutEmptyValues(rawSource))
  if (options.ignoreBuildPhase) delete source.NEXT_PHASE

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
    // eslint-disable-next-line no-restricted-properties -- this module is the sanctioned reader
    cached = load(process.env)
  }
  return cached
}

export function assertRuntimeEnv(): Env {
  // eslint-disable-next-line no-restricted-properties -- this module is the sanctioned reader
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
  // eslint-disable-next-line no-restricted-properties -- this module is the sanctioned reader
  const value = process.env[name]
  return value === undefined || value === '' ? undefined : value
}

export const env: Env = new Proxy({} as Env, {
  get: (_target, prop: string) => assertEnv()[prop as keyof Env],
  has: (_target, prop: string) => prop in assertEnv(),
  ownKeys: () => Reflect.ownKeys(assertEnv()),
  getOwnPropertyDescriptor: (_target, prop) =>
    Reflect.getOwnPropertyDescriptor(assertEnv(), prop),
})

export function resetEnvForTests(): void {
  cached = undefined
}

export const isProduction = (): boolean => assertEnv().NODE_ENV === "production"
export const isTest = (): boolean => assertEnv().NODE_ENV === "test"
export const isDemoMode = (): boolean => assertEnv().DEMO_MODE
