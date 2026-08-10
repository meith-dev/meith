import { ValidationError } from '@meith/core'

export type Flags = ReadonlyMap<string, string>

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
    if (next === undefined || next.startsWith('--')) {
      flags.set(body, 'true')
      continue
    }

    flags.set(body, next)
    i++
  }

  return { flags, positional }
}

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

export function integer(flags: Flags, name: string): number | undefined {
  const raw = optional(flags, name)
  if (raw === undefined) return undefined

  const value = Number(raw)
  if (!Number.isInteger(value)) {
    throw new ValidationError(`--${name} must be a whole number, got "${raw}".`)
  }
  return value
}
