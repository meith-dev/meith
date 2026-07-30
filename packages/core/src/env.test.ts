/**
 * F02 — the environment contract.
 *
 * `parseEnv` is pure over the object it is handed (no `process.env` read), so
 * these drive it with explicit inputs rather than mutating the ambient env.
 */
import { describe, expect, it } from 'vitest'

import { parseEnv } from './env'

/** Minimal env that parses cleanly; spread and override per case. */
const base = {
  NODE_ENV: 'production',
  AUTH_SECRET: 'a'.repeat(32),
  TICK_SECRET: 'b'.repeat(32),
  QUEUE_DRIVER: 'redis',
  REDIS_URL: 'redis://localhost:6379',
} satisfies NodeJS.ProcessEnv

describe('derived defaults', () => {
  it('falls back to the fixture data source when no database is configured', () => {
    const env = parseEnv({ NODE_ENV: 'development' })
    expect(env.DATA_SOURCE).toBe('fixture')
    // The whole point of deriving these: a database-less checkout must boot
    // without the operator setting anything.
    expect(env.QUEUE_DRIVER).toBe('memory')
    expect(env.CACHE_DRIVER).toBe('memory')
  })

  it('derives the postgres drivers from a bare DATABASE_URL', () => {
    const env = parseEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://u:p@localhost:5432/forum',
    })
    expect(env.DATA_SOURCE).toBe('postgres')
    expect(env.QUEUE_DRIVER).toBe('postgres')
  })
})

describe('cross-field rules', () => {
  it('names the offending variable, not just "invalid config"', () => {
    expect(() => parseEnv({ NODE_ENV: 'development', DATA_SOURCE: 'postgres' })).toThrow(
      /DATABASE_URL/,
    )
  })

  it('rejects a redis driver with no REDIS_URL', () => {
    expect(() => parseEnv({ ...base, REDIS_URL: undefined })).toThrow(/REDIS_URL/)
  })

  it('rejects a low-entropy secret', () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/)
  })
})

/**
 * These are the rules that keep a misconfigured *server* from accepting
 * traffic. They are suppressed during `next build` (see NEXT_PHASE in env.ts),
 * which is the one case where NODE_ENV=production describes a compiler rather
 * than a running service — so both directions are pinned here.
 */
describe('production rules', () => {
  it('refuses to boot a production server with a memory queue', () => {
    expect(() => parseEnv({ ...base, QUEUE_DRIVER: 'memory', REDIS_URL: undefined })).toThrow(
      /QUEUE_DRIVER/,
    )
  })

  it('requires AUTH_SECRET and TICK_SECRET in production', () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: undefined })).toThrow(/AUTH_SECRET/)
    expect(() => parseEnv({ ...base, TICK_SECRET: undefined })).toThrow(/TICK_SECRET/)
  })

  it('does not apply them during `next build`, which has no runtime secrets', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
    })
    expect(env.QUEUE_DRIVER).toBe('memory')
    expect(env.AUTH_SECRET).toBeUndefined()
  })

  it('still applies them when NODE_ENV is production and no build is running', () => {
    // Guards the inverse of the case above: an arbitrary NEXT_PHASE value must
    // not become a way to boot a secretless production server.
    expect(() => parseEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-server' })).toThrow(
      /AUTH_SECRET/,
    )
  })

  /*
   * The boot path (instrumentation.ts → assertRuntimeEnv) passes this option so
   * the build-phase exemption cannot reach a running server. Without it, a
   * NEXT_PHASE that leaked into a production environment — a copied env file, a
   * single-stage image — would fail open and serve traffic with no AUTH_SECRET.
   */
  it('cannot be waived by NEXT_PHASE when validating for a running server', () => {
    const buildPhase = { NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' } as const

    expect(() => parseEnv(buildPhase)).not.toThrow()
    expect(() => parseEnv(buildPhase, { ignoreBuildPhase: true })).toThrow(/AUTH_SECRET/)
  })

  it('leaves the caller-supplied environment untouched', () => {
    // `ignoreBuildPhase` drops NEXT_PHASE before parsing; that must not be
    // visible to the caller, which for the boot path is `process.env` itself.
    const source: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
    }
    expect(() => parseEnv(source, { ignoreBuildPhase: true })).toThrow()
    expect(source.NEXT_PHASE).toBe('phase-production-build')
  })
})
