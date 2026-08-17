export type ErrorCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'CONFIGURATION'

export const ERROR_MESSAGE_KEYS = {
  VALIDATION: 'error.validation',
  FORBIDDEN: 'error.forbidden',
  NOT_FOUND: 'error.notFound',
  CONFLICT: 'error.conflict',
  RATE_LIMITED: 'error.rateLimited',
  INTERNAL: 'error.internal',
  CONFIGURATION: 'error.configuration',
} as const satisfies Record<ErrorCode, string>

export const ERROR_MESSAGES = {
  VALIDATION: 'The submitted data was invalid.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'That page could not be found.',
  CONFLICT: 'That action conflicts with the current state.',
  RATE_LIMITED: 'You are doing that too often. Please wait and try again.',
  INTERNAL: 'Something went wrong on our end.',
  CONFIGURATION: 'This server is misconfigured.',
} as const satisfies Record<ErrorCode, string>

export type MessageResolver = (key: string) => string | undefined

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode

  readonly publicMessage: string

  readonly publicMessageKey: string | null

  readonly meta: Readonly<Record<string, unknown>>

  constructor(
    message: string,
    options?: {
      publicMessage?: string
      publicMessageKey?: string | null
      meta?: Record<string, unknown>
      cause?: unknown
    },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = new.target.name
    this.publicMessage = options?.publicMessage ?? message
    this.publicMessageKey = options?.publicMessageKey ?? null
    this.meta = Object.freeze({ ...options?.meta })
  }
}

export function publicMessageOf(value: unknown, resolve?: MessageResolver): string {
  if (!isAppError(value)) {
    return resolve?.(ERROR_MESSAGE_KEYS.INTERNAL) ?? ERROR_MESSAGES.INTERNAL
  }
  if (value.publicMessageKey === null) return value.publicMessage
  return resolve?.(value.publicMessageKey) ?? value.publicMessage
}

export class ValidationError extends AppError {
  override readonly code = 'VALIDATION' as const
  readonly fieldErrors: Readonly<Record<string, string[]>>

  constructor(
    message?: string,
    fieldErrors: Record<string, string[]> = {},
    options?: { meta?: Record<string, unknown>; cause?: unknown },
  ) {
    const text = message ?? ERROR_MESSAGES.VALIDATION
    super(text, {
      publicMessage: text,
      publicMessageKey: message === undefined ? ERROR_MESSAGE_KEYS.VALIDATION : null,
      ...options,
    })
    this.fieldErrors = Object.freeze(fieldErrors)
  }
}

export class ForbiddenError extends AppError {
  override readonly code = 'FORBIDDEN' as const

  constructor(
    message?: string,
    options?: { action?: string; meta?: Record<string, unknown>; cause?: unknown },
  ) {
    const text = message ?? ERROR_MESSAGES.FORBIDDEN
    super(text, {
      publicMessage: text,
      publicMessageKey: message === undefined ? ERROR_MESSAGE_KEYS.FORBIDDEN : null,
      meta: {
        ...options?.meta,
        ...(options?.action === undefined ? {} : { action: options.action }),
      },
      ...(options?.cause === undefined ? {} : { cause: options.cause }),
    })
  }
}

export class NotFoundError extends AppError {
  override readonly code = 'NOT_FOUND' as const

  constructor(message?: string, options?: { meta?: Record<string, unknown>; cause?: unknown }) {
    const text = message ?? ERROR_MESSAGES.NOT_FOUND
    super(text, {
      publicMessage: text,
      publicMessageKey: message === undefined ? ERROR_MESSAGE_KEYS.NOT_FOUND : null,
      ...options,
    })
  }
}

export class ConflictError extends AppError {
  override readonly code = 'CONFLICT' as const

  constructor(message?: string, options?: { meta?: Record<string, unknown>; cause?: unknown }) {
    const text = message ?? ERROR_MESSAGES.CONFLICT
    super(text, {
      publicMessage: text,
      publicMessageKey: message === undefined ? ERROR_MESSAGE_KEYS.CONFLICT : null,
      ...options,
    })
  }
}

export class RateLimitedError extends AppError {
  override readonly code = 'RATE_LIMITED' as const
  readonly retryAfterSeconds: number

  constructor(
    retryAfterSeconds: number,
    message?: string,
    options?: { meta?: Record<string, unknown>; cause?: unknown },
  ) {
    const text = message ?? ERROR_MESSAGES.RATE_LIMITED
    super(text, {
      publicMessage: text,
      publicMessageKey: message === undefined ? ERROR_MESSAGE_KEYS.RATE_LIMITED : null,
      ...options,
    })
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class InternalError extends AppError {
  override readonly code = 'INTERNAL' as const

  constructor(message: string, options?: { meta?: Record<string, unknown>; cause?: unknown }) {
    super(message, {
      publicMessage: ERROR_MESSAGES.INTERNAL,
      publicMessageKey: ERROR_MESSAGE_KEYS.INTERNAL,
      ...options,
    })
  }
}

export class ConfigurationError extends AppError {
  override readonly code = 'CONFIGURATION' as const

  constructor(message: string, options?: { meta?: Record<string, unknown>; cause?: unknown }) {
    super(message, {
      publicMessage: ERROR_MESSAGES.CONFIGURATION,
      publicMessageKey: ERROR_MESSAGE_KEYS.CONFIGURATION,
      ...options,
    })
  }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 422,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  CONFIGURATION: 500,
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

export function statusForError(value: unknown): number {
  return isAppError(value) ? STATUS_BY_CODE[value.code] : 500
}

export interface PublicErrorBody {
  error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> }
}

export function toPublicError(value: unknown, resolve?: MessageResolver): PublicErrorBody {
  if (value instanceof ValidationError) {
    return {
      error: {
        code: value.code,
        message: publicMessageOf(value, resolve),
        fieldErrors: { ...value.fieldErrors },
      },
    }
  }
  if (isAppError(value)) {
    return { error: { code: value.code, message: publicMessageOf(value, resolve) } }
  }
  return { error: { code: 'INTERNAL', message: publicMessageOf(value, resolve) } }
}
