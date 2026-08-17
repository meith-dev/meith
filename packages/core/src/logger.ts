import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

import pino from 'pino'

import { env } from './env'

export interface RequestContext {
  requestId: string
  userId?: number
  jobId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function truncateIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined
  const value = ip.trim()
  if (value.length === 0) return undefined

  if (value.includes(':')) {
    const groups = value.split(':').filter((segment) => segment.length > 0)
    return `${groups.slice(0, 3).join(':')}::/48`
  }

  const octets = value.split('.')
  if (octets.length !== 4) return undefined
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`
}

let pinoInstance: pino.Logger | undefined

function buildLogger(): pino.Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: null,
    redact: {
      paths: [
        'password',
        '*.password',
        'passwordConfirm',
        '*.passwordConfirm',
        'password_hash',
        '*.password_hash',
        'token',
        '*.token',
        'sessionToken',
        '*.sessionToken',
        'cookie',
        '*.cookie',
        'authorization',
        '*.authorization',
        'secret',
        '*.secret',
        'req.headers.cookie',
        'req.headers.authorization',
      ],
      censor: '[redacted]',
    },
    formatters: {
      level(label) {
        return { level: label }
      },
    },
  })
}

export function baseLogger(): pino.Logger {
  pinoInstance ??= buildLogger()
  return pinoInstance
}

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

export function withRequestContext<T>(context: Partial<RequestContext>, fn: () => T): T {
  const parent = storage.getStore()

  const next: RequestContext = {
    requestId: context.requestId ?? parent?.requestId ?? newRequestId(),
  }

  const userId = context.userId ?? parent?.userId
  if (userId !== undefined) next.userId = userId

  const jobId = context.jobId ?? parent?.jobId
  if (jobId !== undefined) next.jobId = jobId

  return storage.run(next, fn)
}

export function stampRequestId<T extends Record<string, unknown>>(
  payload: T,
): T & { __requestId?: string } {
  const requestId = currentRequestId()
  return requestId === undefined ? payload : { ...payload, __requestId: requestId }
}
