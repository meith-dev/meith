export type ErrorCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'CONFIGURATION'

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode

  readonly publicMessage: string

  readonly meta: Readonly<Record<string, unknown>>

  constructor(
    message: string,
    options?: { publicMessage?: string; meta?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = new.target.name
    this.publicMessage = options?.publicMessage ?? message
    this.meta = Object.freeze({ ...options?.meta })
  }
}

export class ValidationError extends AppError {
  override readonly code = 'VALIDATION' as const
  readonly fieldErrors: Readonly<Record<string, string[]>>

  constructor(
    message = 'The submitted data was invalid.',
    fieldErrors: Record<string, string[]> = {},
    options?: { meta?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { publicMessage: message, ...options })
    this.fieldErrors = Object.freeze(fieldErrors)
  }
}

export class ForbiddenError extends AppError {
  override readonly code = 'FORBIDDEN' as const

  constructor(
    message = 'You do not have permission to do that.',
    options?: { action?: string; meta?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, {
      publicMessage: message,
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

  constructor(
    message = 'That page could not be found.',
    options?: { meta?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { publicMessage: message, ...options })
  }
}

export class ConflictError extends AppError {
  override readonly code = 'CONFLICT' as const

  constructor(
    message = 'That action conflicts with the current state.',
    options?: { meta?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { publicMessage: message, ...options })
  }
}

export class RateLimitedError extends AppError {
  override readonly code = 'RATE_LIMITED' as const
  readonly retryAfterSeconds: number

  constructor(
    retryAfterSeconds: number,
    message = 'You are doing that too often. Please wait and try again.',
    options?: { meta?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { publicMessage: message, ...options })
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class InternalError extends AppError {
  override readonly code = 'INTERNAL' as const

  constructor(message: string, options?: { meta?: Record<string, unknown>; cause?: unknown }) {
    super(message, { publicMessage: 'Something went wrong on our end.', ...options })
  }
}

export class ConfigurationError extends AppError {
  override readonly code = 'CONFIGURATION' as const

  constructor(message: string, options?: { meta?: Record<string, unknown>; cause?: unknown }) {
    super(message, { publicMessage: 'This server is misconfigured.', ...options })
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

export function toPublicError(value: unknown): PublicErrorBody {
  if (value instanceof ValidationError) {
    return {
      error: {
        code: value.code,
        message: value.publicMessage,
        fieldErrors: { ...value.fieldErrors },
      },
    }
  }
  if (isAppError(value)) {
    return { error: { code: value.code, message: value.publicMessage } }
  }
  return { error: { code: 'INTERNAL', message: 'Something went wrong on our end.' } }
}
