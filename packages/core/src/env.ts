/**
 * F02 — the ONE place in the entire workspace allowed to touch `process.env`.
 *
 * Everything else imports the typed `env` object from here. The ESLint rule
 * `no-restricted-properties` (see eslint.config.mjs) fails any other module that
 * reads `process.env`, so this is enforced and not merely a convention.
 *
 * Validation happens at module load: a missing or malformed variable is a startup
 * crash naming the offending variable, never a mysterious `undefined` at runtime
 * three layers deep in a request.
 */
import { z } from "zod"

const nonEmpty = z.string().min(1)

/**
 * Postgres connection string. Must be the *transaction pooler* URL on serverless
 * (see .env.example) — a direct connection exhausts the database's connection
 * slots under Vercel's per-request isolation model.
 */
const databaseUrl = z
  .string()
  .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
    message: "must be a postgres:// or postgresql:// connection string",
  })

const secret = z
  .string()
  .min(32, "must be at least 32 characters of high-entropy random data")

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    /**
     * Set by `next build`, and by nothing else. Not application configuration:
     * it is how this schema tells "compiling the app" apart from "serving the
     * app".
     *
     * `next build` forces NODE_ENV=production, so without this distinction the
     * production-only rules below would demand runtime secrets from a build
     * machine that has no business holding them — CI would need AUTH_SECRET
     * merely to typecheck and prerender. The rules still apply with full force
     * when the server actually boots: `instrumentation.ts` calls `assertEnv()`
     * in `register()`, where NEXT_PHASE is absent.
     */
    NEXT_PHASE: z.string().optional(),

    /**
     * Which repository implementation backs the domain packages.
     * `fixture` is an in-memory, deterministically seeded implementation used for
     * local development and the test suite; `postgres` uses Drizzle + postgres.js.
     */
    /* Always supplied by `withDerivedDefaults`. See QUEUE_DRIVER below. */
    DATA_SOURCE: z.enum(["fixture", "postgres"]),
    DATABASE_URL: databaseUrl.optional(),

    /**
     * Direct (non-pooled) connection string, used only by the migration runner.
     *
     * Migrations take a session-level advisory lock so concurrent deploys
     * serialise. A transaction-mode pooler may route successive statements to
     * different backends, which makes that lock invisible to the next statement
     * and lets two deploys interleave DDL. Falls back to `DATABASE_URL` when
     * unset, which is correct for a direct (non-pooled) Postgres.
     */
    DIRECT_DATABASE_URL: databaseUrl.optional(),

    /**
     * postgres.js pool size *per process*. Serverless runs many isolated
     * instances, each with its own pool, so this multiplies by instance count
     * against the database's connection ceiling. Keep it small; the pooler,
     * not this number, provides concurrency.
     */
    DATABASE_POOL_MAX: z.coerce.number().int().positive().max(20).default(3),

    AUTH_SECRET: secret.optional(),
    TICK_SECRET: secret.optional(),

    /** Absolute public origin, used for e-mail links and canonical URLs. */
    APP_URL: z.string().url().optional(),

    /**
     * `memory` is only viable single-process (dev, tests): jobs live in the
     * heap and die with it. Defaults are derived from DATA_SOURCE in
     * `withDerivedDefaults` so a database-less checkout boots without needing
     * to set anything.
     */
    /*
     * Not `.optional()`: `withDerivedDefaults` always supplies a value before
     * parsing, so leaving it optional would push an impossible `undefined` case
     * into every consumer's switch statement.
     */
    QUEUE_DRIVER: z.enum(["memory", "postgres", "redis"]),
    CACHE_DRIVER: z.enum(["memory", "next", "redis"]),
    FILESTORE_DRIVER: z.enum(["local", "s3"]).default("local"),
    MAIL_DRIVER: z.enum(["log", "http", "smtp"]).default("log"),

    REDIS_URL: z.string().url().optional(),

    /** Root for FILESTORE_DRIVER=local. Ephemeral on serverless — see F05. */
    UPLOADS_DIR: nonEmpty.default(".uploads"),

    S3_BUCKET: nonEmpty.optional(),
    S3_REGION: nonEmpty.optional(),
    S3_ACCESS_KEY_ID: nonEmpty.optional(),
    S3_SECRET_ACCESS_KEY: nonEmpty.optional(),
    S3_ENDPOINT: z.string().url().optional(),

    MAIL_FROM: z.string().email().optional(),
    MAIL_HTTP_ENDPOINT: z.string().url().optional(),
    MAIL_HTTP_TOKEN: nonEmpty.optional(),

    /** Wall-clock budget for one `/api/system/tick` invocation. */
    TICK_DEADLINE_MS: z.coerce.number().int().positive().default(50_000),
    /** Max jobs drained per tick before yielding, regardless of remaining time. */
    TICK_MAX_JOBS: z.coerce.number().int().positive().default(25),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  /**
   * Cross-field rules. These are the constraints that actually bite in production:
   * a driver selected without the credentials it needs fails on first use, which
   * on a queue driver can mean silent job loss.
   */
  .superRefine((value, ctx) => {
    if (value.DATA_SOURCE === "postgres" && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "is required when DATA_SOURCE=postgres",
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

    if (value.MAIL_DRIVER === "http" && !value.MAIL_HTTP_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MAIL_HTTP_ENDPOINT"],
        message: "is required when MAIL_DRIVER=http",
      })
    }

    /*
     * Guarded on the build phase, not just NODE_ENV: these are the rules about
     * how the app will *behave in service*, and a build produces no behaviour.
     * See the NEXT_PHASE field above.
     */
    if (value.NODE_ENV === "production" && value.NEXT_PHASE !== "phase-production-build") {
      /*
       * A memory queue in production silently drops every queued job on each
       * cold start — e-mail, search indexing, notifications all vanish with no
       * error. Refuse to boot instead.
       */
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
    }
  })

/**
 * `DATA_SOURCE`, `QUEUE_DRIVER` and `CACHE_DRIVER` are non-optional here because
 * `withDerivedDefaults` guarantees a value before parsing — no intersection type
 * or post-parse fixup is needed.
 */
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

/**
 * Resolves the interdependent defaults before validation runs.
 *
 * `DATA_SOURCE` and `QUEUE_DRIVER` cannot use plain zod `.default()` values
 * because each depends on whether DATABASE_URL is present, and zod applies
 * defaults before `superRefine` can see them. Without this, a checkout with no
 * database fails validation demanding a DATABASE_URL for the *queue* — a
 * variable the operator never asked to configure.
 */
function withDerivedDefaults(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const hasDb = Boolean(source.DATABASE_URL)
  const dataSource = source.DATA_SOURCE ?? (hasDb ? "postgres" : "fixture")

  return {
    ...source,
    DATA_SOURCE: dataSource,
    // Postgres-backed queue only makes sense when there is a database to back it.
    QUEUE_DRIVER:
      source.QUEUE_DRIVER ?? (dataSource === "postgres" ? "postgres" : "memory"),
    // The Next data cache needs a running Next server; fixture mode is also
    // used from plain Node (CLI, tests), where `next` would be meaningless.
    CACHE_DRIVER:
      source.CACHE_DRIVER ?? (dataSource === "postgres" ? "next" : "memory"),
  }
}

/**
 * `ignoreBuildPhase` makes the production rules unskippable, whatever NEXT_PHASE
 * says. Used by the server-boot path: a build flag that somehow reaches a
 * running server must not quietly switch off the checks that keep it from
 * serving traffic without secrets.
 */
interface LoadOptions {
  readonly ignoreBuildPhase?: boolean
}

function load(rawSource: NodeJS.ProcessEnv, options: LoadOptions = {}): Env {
  // `withDerivedDefaults` returns a fresh object, so this never mutates the
  // caller's environment.
  const source = withDerivedDefaults(rawSource)
  if (options.ignoreBuildPhase) delete source.NEXT_PHASE

  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    throw new Error(formatIssues(parsed.error))
  }

  return parsed.data
}

/**
 * Exported for tests, which need to assert that specific malformed inputs are
 * rejected with a message naming the offending variable.
 */
export function parseEnv(source: NodeJS.ProcessEnv, options: LoadOptions = {}): Env {
  return load(source, options)
}

let cached: Env | undefined

/**
 * Validates and returns the environment, memoising the result.
 *
 * Call this explicitly from application boot (see apps/forum/instrumentation.ts)
 * so misconfiguration is a startup crash, per F02.
 */
export function assertEnv(): Env {
  if (!cached) {
    // eslint-disable-next-line no-restricted-properties -- this module is the sanctioned reader
    cached = load(process.env)
  }
  return cached
}

/**
 * Boot-time validation for a server that is about to accept traffic.
 *
 * Differs from `assertEnv()` in one way that matters: the production-only rules
 * cannot be stood down here. `assertEnv()` honours NEXT_PHASE so that `next
 * build` can compile without runtime secrets — but a *server* has no legitimate
 * reason to be in the build phase, and treating a stray NEXT_PHASE as licence to
 * skip the AUTH_SECRET check would fail open, silently, in production.
 *
 * Always re-validates rather than trusting a memoised value, since a lenient
 * parse may already have been cached by an earlier `env` read.
 */
export function assertRuntimeEnv(): Env {
  // eslint-disable-next-line no-restricted-properties -- this module is the sanctioned reader
  const validated = load(process.env, { ignoreBuildPhase: true })
  cached ??= validated
  return cached
}

/**
 * The typed environment. Every property access is a live read through
 * `assertEnv()`.
 *
 * Deliberately a Proxy rather than `export const env = load(process.env)`:
 * validating at *module* load means merely importing any `@forum/core` symbol
 * — a type, an error class — detonates in contexts that have no app
 * environment at all. That broke `drizzle-kit generate`, which imports the
 * schema (and therefore core's permission registry) purely to diff DDL and has
 * no DATABASE_URL by design. Failing on first *use* keeps the fail-fast
 * guarantee where it matters while letting tooling import types freely.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, prop: string) => assertEnv()[prop as keyof Env],
  has: (_target, prop: string) => prop in assertEnv(),
  ownKeys: () => Reflect.ownKeys(assertEnv()),
  getOwnPropertyDescriptor: (_target, prop) =>
    Reflect.getOwnPropertyDescriptor(assertEnv(), prop),
})

/** Test-only: drops the memoised value so a new process env can be applied. */
export function resetEnvForTests(): void {
  cached = undefined
}

export const isProduction = (): boolean => assertEnv().NODE_ENV === "production"
export const isTest = (): boolean => assertEnv().NODE_ENV === "test"
