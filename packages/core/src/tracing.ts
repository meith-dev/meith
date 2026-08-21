import type { Span, Tracer } from '@opentelemetry/api'
import { SpanStatusCode, trace } from '@opentelemetry/api'

import { env } from './env'
import { logger } from './logger'

export const tracer: Tracer = trace.getTracer('meith')

let initialised = false

export async function initTracing(serviceName: string): Promise<void> {
  if (initialised || !env.OTEL_ENABLED) return
  initialised = true

  try {
    const [
      { NodeTracerProvider, BatchSpanProcessor },
      { OTLPTraceExporter },
      { resourceFromAttributes },
      { ATTR_SERVICE_NAME },
    ] = await Promise.all([
      import('@opentelemetry/sdk-trace-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/resources'),
      import('@opentelemetry/semantic-conventions'),
    ])

    const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT
    const provider = new NodeTracerProvider({
      resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter(endpoint === undefined ? {} : { url: endpoint }),
        ),
      ],
    })
    provider.register()

    logger({ module: 'tracing' }).info(
      { service: serviceName, endpoint },
      'OpenTelemetry tracing initialised',
    )
  } catch (err) {
    logger({ module: 'tracing' }).warn({ err }, 'could not initialise OpenTelemetry tracing')
  }
}

export function resetTracingForTests(): void {
  initialised = false
}

export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      span.recordException(error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      throw err
    } finally {
      span.end()
    }
  })
}
