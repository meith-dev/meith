import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests } from './env'
import { initTracing, resetTracingForTests, tracer } from './tracing'

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTests()
  resetTracingForTests()
})

describe('initTracing', () => {
  it('does nothing when OTEL_ENABLED is unset', async () => {
    await expect(initTracing('meith-test')).resolves.toBeUndefined()
  })

  it('registers a provider when OTEL_ENABLED is set, without reaching the network', async () => {
    vi.stubEnv('OTEL_ENABLED', '1')
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector.internal:4318/v1/traces')
    resetEnvForTests()

    await expect(initTracing('meith-test')).resolves.toBeUndefined()
  })

  it('only initialises once, so a second caller in the same process is a no-op', async () => {
    vi.stubEnv('OTEL_ENABLED', '1')
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector.internal:4318/v1/traces')
    resetEnvForTests()

    await initTracing('meith-test')
    await expect(initTracing('meith-test-again')).resolves.toBeUndefined()
  })
})

describe('tracer', () => {
  it('is safe to use with no SDK registered — every call is a documented no-op', async () => {
    const result = await tracer.startActiveSpan('op', async (span) => {
      span.setAttribute('answer', 42)
      return 'done'
    })

    expect(result).toBe('done')
  })
})
