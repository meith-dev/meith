export interface MetricLabels {
  readonly [name: string]: string
}

export interface Counter {
  inc(value?: number, labels?: MetricLabels): void
}

export interface Gauge {
  set(value: number, labels?: MetricLabels): void
}

export interface Histogram {
  observe(value: number, labels?: MetricLabels): void
}

export interface MetricsPort {
  counter(name: string, help: string): Counter
  gauge(name: string, help: string): Gauge
  histogram(name: string, help: string, buckets?: readonly number[]): Histogram
}

const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
]

type MetricKind = 'counter' | 'gauge' | 'histogram'

interface CounterState {
  value: number
}

interface GaugeState {
  value: number
}

interface HistogramState {
  sum: number
  count: number
  bucketCounts: number[]
}

interface Series {
  readonly labels: MetricLabels
  readonly state: CounterState | GaugeState | HistogramState
}

interface MetricEntry {
  readonly kind: MetricKind
  readonly help: string
  readonly buckets?: readonly number[]
  readonly series: Map<string, Series>
}

const NAME_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/

function assertValidName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`"${name}" is not a valid Prometheus metric name.`)
  }
}

function labelKey(labels: MetricLabels): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${JSON.stringify(labels[key])}`)
    .join(',')
}

export class PrometheusRegistry implements MetricsPort {
  private readonly metrics = new Map<string, MetricEntry>()

  counter(name: string, help: string): Counter {
    const entry = this.entry(name, help, 'counter')
    return {
      inc: (value = 1, labels = {}) => {
        const state = this.seriesState<CounterState>(entry, labels, () => ({ value: 0 }))
        state.value += value
      },
    }
  }

  gauge(name: string, help: string): Gauge {
    const entry = this.entry(name, help, 'gauge')
    return {
      set: (value, labels = {}) => {
        const state = this.seriesState<GaugeState>(entry, labels, () => ({ value: 0 }))
        state.value = value
      },
    }
  }

  histogram(
    name: string,
    help: string,
    buckets: readonly number[] = DEFAULT_HISTOGRAM_BUCKETS,
  ): Histogram {
    const sorted = [...buckets].sort((a, b) => a - b)
    const entry = this.entry(name, help, 'histogram', sorted)
    return {
      observe: (value, labels = {}) => {
        const state = this.seriesState<HistogramState>(entry, labels, () => ({
          sum: 0,
          count: 0,
          bucketCounts: new Array<number>(sorted.length).fill(0),
        }))
        state.sum += value
        state.count += 1
        for (const [i, bound] of sorted.entries()) {
          if (value <= bound) state.bucketCounts[i] = (state.bucketCounts[i] ?? 0) + 1
        }
      },
    }
  }

  render(): string {
    const lines: string[] = []
    for (const [name, entry] of this.metrics) {
      lines.push(`# HELP ${name} ${escapeHelp(entry.help)}`)
      lines.push(`# TYPE ${name} ${entry.kind}`)
      for (const { labels, state } of entry.series.values()) {
        if (entry.kind === 'histogram') {
          renderHistogramSeries(lines, name, labels, entry.buckets ?? [], state as HistogramState)
        } else {
          lines.push(`${name}${formatLabels(labels)} ${(state as CounterState | GaugeState).value}`)
        }
      }
    }
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`
  }

  reset(): void {
    this.metrics.clear()
  }

  private entry(
    name: string,
    help: string,
    kind: MetricKind,
    buckets?: readonly number[],
  ): MetricEntry {
    assertValidName(name)
    const existing = this.metrics.get(name)
    if (existing) {
      if (existing.kind !== kind) {
        throw new Error(`"${name}" is already registered as a ${existing.kind}, not a ${kind}.`)
      }
      return existing
    }
    const created: MetricEntry = { kind, help, ...(buckets ? { buckets } : {}), series: new Map() }
    this.metrics.set(name, created)
    return created
  }

  private seriesState<TState>(
    entry: MetricEntry,
    labels: MetricLabels,
    init: () => TState,
  ): TState {
    const key = labelKey(labels)
    const existing = entry.series.get(key)
    if (existing) return existing.state as TState
    const state = init() as Series['state']
    entry.series.set(key, { labels, state })
    return state as TState
  }
}

function renderHistogramSeries(
  lines: string[],
  name: string,
  labels: MetricLabels,
  buckets: readonly number[],
  state: HistogramState,
): void {
  for (let i = 0; i < buckets.length; i++) {
    lines.push(
      `${name}_bucket${formatLabels({ ...labels, le: String(buckets[i]) })} ${state.bucketCounts[i]}`,
    )
  }
  lines.push(`${name}_bucket${formatLabels({ ...labels, le: '+Inf' })} ${state.count}`)
  lines.push(`${name}_sum${formatLabels(labels)} ${state.sum}`)
  lines.push(`${name}_count${formatLabels(labels)} ${state.count}`)
}

function formatLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (entries.length === 0) return ''
  return `{${entries.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`).join(',')}}`
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function escapeHelp(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
}

export const metrics = new PrometheusRegistry()
