import { describe, expect, it } from 'vitest'

import { PrometheusRegistry } from './metrics'

describe('counters', () => {
  it('starts at zero and accumulates', () => {
    const registry = new PrometheusRegistry()
    const runs = registry.counter('meith_task_runs_total', 'Task runs, by outcome.')

    runs.inc()
    runs.inc(2)

    expect(registry.render()).toContain('meith_task_runs_total 3')
  })

  it('keeps a separate series per label set', () => {
    const registry = new PrometheusRegistry()
    const runs = registry.counter('meith_task_runs_total', 'Task runs, by outcome.')

    runs.inc(1, { task: 'demo-reset', status: 'ran' })
    runs.inc(1, { task: 'demo-reset', status: 'failed' })
    runs.inc(1, { task: 'demo-reset', status: 'ran' })

    const rendered = registry.render()
    expect(rendered).toContain('meith_task_runs_total{status="ran",task="demo-reset"} 2')
    expect(rendered).toContain('meith_task_runs_total{status="failed",task="demo-reset"} 1')
  })

  it('refuses to re-register a name under a different kind', () => {
    const registry = new PrometheusRegistry()
    registry.counter('meith_thing', 'A thing.')

    expect(() => registry.gauge('meith_thing', 'A thing.')).toThrow(
      /already registered as a counter/,
    )
  })

  it('refuses a name Prometheus cannot parse', () => {
    const registry = new PrometheusRegistry()
    expect(() => registry.counter('not a valid name', 'help')).toThrow(/not a valid Prometheus/)
  })
})

describe('gauges', () => {
  it('replaces the value rather than accumulating it', () => {
    const registry = new PrometheusRegistry()
    const depth = registry.gauge('meith_queue_jobs', 'Queued jobs.')

    depth.set(5)
    depth.set(2)

    expect(registry.render()).toContain('meith_queue_jobs 2')
  })
})

describe('histograms', () => {
  it('renders cumulative bucket counts, a sum and a count', () => {
    const registry = new PrometheusRegistry()
    const duration = registry.histogram(
      'meith_task_run_duration_seconds',
      'Task duration.',
      [0.1, 0.5, 1],
    )

    duration.observe(0.05)
    duration.observe(0.3)
    duration.observe(2)

    const rendered = registry.render()
    expect(rendered).toContain('meith_task_run_duration_seconds_bucket{le="0.1"} 1')
    expect(rendered).toContain('meith_task_run_duration_seconds_bucket{le="0.5"} 2')
    expect(rendered).toContain('meith_task_run_duration_seconds_bucket{le="1"} 2')
    expect(rendered).toContain('meith_task_run_duration_seconds_bucket{le="+Inf"} 3')
    expect(rendered).toContain('meith_task_run_duration_seconds_sum 2.35')
    expect(rendered).toContain('meith_task_run_duration_seconds_count 3')
  })
})

describe('rendering', () => {
  it('writes HELP and TYPE lines ahead of a metric its series', () => {
    const registry = new PrometheusRegistry()
    registry.counter('meith_task_runs_total', 'Task runs, by outcome.').inc()

    const lines = registry.render().trim().split('\n')
    expect(lines[0]).toBe('# HELP meith_task_runs_total Task runs, by outcome.')
    expect(lines[1]).toBe('# TYPE meith_task_runs_total counter')
    expect(lines[2]).toBe('meith_task_runs_total 1')
  })

  it('renders nothing for a registry with no metrics recorded', () => {
    expect(new PrometheusRegistry().render()).toBe('')
  })

  it('escapes a quote or backslash in a label value', () => {
    const registry = new PrometheusRegistry()
    registry.counter('meith_thing', 'help').inc(1, { detail: 'a "quote" and a \\backslash' })

    expect(registry.render()).toContain('detail="a \\"quote\\" and a \\\\backslash"')
  })

  it('forgets every series after reset', () => {
    const registry = new PrometheusRegistry()
    registry.counter('meith_thing', 'help').inc()
    registry.reset()

    expect(registry.render()).toBe('')
  })
})
