import { ValidationError } from '@meith/core'

export interface WriteFailure {
  readonly command: string
  readonly path: string
  readonly target: string
  readonly reference: string
}

export function isFsPermissionError(error: unknown): error is NodeJS.ErrnoException {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'EACCES' || code === 'EPERM'
}

export function translateWriteError(error: unknown, failure: WriteFailure): never {
  if (isFsPermissionError(error)) {
    throw new ValidationError(
      `${failure.command} could not write to ${failure.path}: permission denied. The account ` +
        `running this command needs write access to ${failure.target} — inside the official ` +
        'image that account is a fixed, non-root user, so a bind-mounted target directory has ' +
        `to already be owned by (or writable by) that same account before ${failure.command} ` +
        `runs. See ${failure.reference} for the exact invocation.`,
    )
  }
  throw error
}
