/**
 * Minimal flag parsing.
 *
 * Hand-rolled rather than a dependency: invariant 2 makes a new runtime
 * dependency an ADR, and the surface here is `--key value` and `--key=value`.
 * Anything richer would be a sign the CLI is growing a UI it should not have.
 */
import { ValidationError } from '@forum/core'

export type Flags = ReadonlyMap<string, string>

/** Parse `--key value` / `--key=value` pairs. Bare words are positional. */
export function parseFlags(args: readonly string[]): {
  flags: Flags
  positional: readonly string[]
} {
  const flags = new Map<string, string>()
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string

    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const body = arg.slice(2)
    const eq = body.indexOf('=')

    if (eq !== -1) {
      flags.set(body.slice(0, eq), body.slice(eq + 1))
      continue
    }

    const next = args[i + 1]
    // A following `--flag` means this one is a boolean, not a key awaiting a
    // value; treating it as a value is how `--force --verbose` silently becomes
    // `force="--verbose"`.
    if (next === undefined || next.startsWith('--')) {
      flags.set(body, 'true')
      continue
    }

    flags.set(body, next)
    i++
  }

  return { flags, positional }
}

/** Read a required flag, failing with the flag's name rather than a stack. */
export function required(flags: Flags, name: string): string {
  const value = flags.get(name)
  if (value === undefined || value.trim() === '') {
    throw new ValidationError(`Missing required option --${name}.`)
  }
  return value
}

export function optional(flags: Flags, name: string): string | undefined {
  const value = flags.get(name)
  return value === undefined || value.trim() === '' ? undefined : value
}

/** Read an integer flag, rejecting `--parent abc` with a readable message. */
export function integer(flags: Flags, name: string): number | undefined {
  const raw = optional(flags, name)
  if (raw === undefined) return undefined

  const value = Number(raw)
  if (!Number.isInteger(value)) {
    throw new ValidationError(`--${name} must be a whole number, got "${raw}".`)
  }
  return value
}
