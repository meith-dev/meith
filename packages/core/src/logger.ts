/**
 * F09 — structured logging with a request ID that survives the hop into a
 * background job, plus redaction that is on by default rather than opt-in.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import pino from "pino"

import { env } from "./env"

export interface RequestContext {
  requestId: string
  /** Present once the actor is resolved; absent for guests and system work. */
  userId?: number
  /** Set on job execution so a log line can be traced back to its producer. */
  jobId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

/**
 * Truncate an IP for logging: IPv4 to /24, IPv6 to /48. Full addresses are
 * personal data and we have no logging use for the host portion.
 */
export function truncateIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined
  const value = ip.trim()
  if (value.length === 0) return undefined

  if (value.includes(":")) {
    const groups = value.split(":").filter((segment) => segment.length > 0)
    return `${groups.slice(0, 3).join(":")}::/48`
  }

  const octets = value.split(".")
  if (octets.length !== 4) return undefined
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`
}

/**
 * Built on first use, not at module load.
 *
 * `env.LOG_LEVEL` goes through the validating proxy, so constructing the logger
 * eagerly would validate the whole environment as a side effect of importing
 * any module that logs — including tooling that has no app env at all.
 */
let pinoInstance: pino.Logger | undefined

function buildLogger(): pino.Logger {
  return pino({
    level: env.LOG_LEVEL,
    // `base: null` (not undefined) is pino's documented way to drop the default
    // pid/hostname bindings, which are noise in a serverless log stream.
    base: null,
    /**
     * Redaction is declared centrally so a new call site cannot accidentally
     * log a credential. Paths cover both flat and nested shapes.
     */
    redact: {
      paths: [
        "password",
        "*.password",
        "passwordConfirm",
        "*.passwordConfirm",
        "password_hash",
        "*.password_hash",
        "token",
        "*.token",
        "sessionToken",
        "*.sessionToken",
        "cookie",
        "*.cookie",
        "authorization",
        "*.authorization",
        "secret",
        "*.secret",
        "req.headers.cookie",
        "req.headers.authorization",
      ],
      censor: "[redacted]",
    },
    formatters: {
      level(label) {
        return { level: label }
      },
    },
  })
}

/** The process-wide pino instance. Prefer `logger()` at call sites. */
export function baseLogger(): pino.Logger {
  pinoInstance ??= buildLogger()
  return pinoInstance
}

/**
 * The logger every module should use. Automatically decorated with whatever
 * request/job context is active, so call sites never thread an ID by hand.
 *
 * Call this *at the point of logging* — never `const log = logger(...)` at
 * module scope. Two things break if you hoist it:
 *
 *  1. The context is read here, once. A module-level instance binds whatever
 *     was ambient at import time — nothing — so every line it writes for the
 *     rest of the process is missing its requestId.
 *  2. It builds pino eagerly, which reads `env.LOG_LEVEL` through the
 *     validating proxy. That turns importing the module into an environment
 *     validation, which is exactly what `env`'s lazy proxy exists to avoid —
 *     and it fails `next build`, whose page-data collection imports server
 *     modules in an environment with no production secrets.
 *
 * Binding inside a function body is fine; it is only module scope that hurts.
 */
export function logger(bindings: Record<string, unknown> = {}) {
  const context = storage.getStore()
  return baseLogger().child({ ...context, ...bindings })
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId
}

export function newRequestId(): string {
  return randomUUID()
}

/** Run `fn` with a fresh (or inherited) request context. */
export function withRequestContext<T>(context: Partial<RequestContext>, fn: () => T): T {
  const parent = storage.getStore()

  /*
   * Built imperatively rather than with conditional spreads: under
   * `exactOptionalPropertyTypes` an optional property must be *absent*, not
   * present-and-undefined, and a spread of a possibly-empty object widens the
   * inferred type to include undefined.
   */
  const next: RequestContext = {
    requestId: context.requestId ?? parent?.requestId ?? newRequestId(),
  }

  const userId = context.userId ?? parent?.userId
  if (userId !== undefined) next.userId = userId

  const jobId = context.jobId ?? parent?.jobId
  if (jobId !== undefined) next.jobId = jobId

  return storage.run(next, fn)
}

/**
 * Attach the ambient request ID to a job payload so a queued job's logs join up
 * with the request that enqueued it (F09 acceptance criterion).
 */
export function stampRequestId<T extends Record<string, unknown>>(payload: T): T & { __requestId?: string } {
  const requestId = currentRequestId()
  return requestId === undefined ? payload : { ...payload, __requestId: requestId }
}
