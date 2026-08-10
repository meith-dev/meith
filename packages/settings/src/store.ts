import { ValidationError } from '@meith/core'
import { SETTING_DEFINITION_BY_KEY, SETTING_DEFINITIONS } from './definitions'
import type { SettingDefinition, SettingKey, SettingValue } from './definitions'

export interface SettingsRepository {
  loadAll(): Promise<ReadonlyMap<string, string>>
  save(entries: ReadonlyMap<string, string>): Promise<void>
  delete(keys: readonly string[]): Promise<void>
}

export interface SettingsSnapshotOptions {
  onInvalid?: (key: string, raw: string, reason: string) => void
}

function serialise(value: unknown): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function coerce(
  definition: SettingDefinition<unknown>,
  raw: string,
): unknown {
  const expected = definition.default

  let candidate: unknown = raw
  if (typeof expected === 'boolean') {
    candidate = raw === '1' || raw === 'true'
  } else if (typeof expected === 'number') {
    candidate = Number(raw)
  } else if (typeof expected === 'object' && expected !== null) {
    try {
      candidate = JSON.parse(raw)
    } catch {
      candidate = raw
    }
  }

  return definition.schema.parse(candidate)
}

export class SettingsSnapshot {
  private constructor(private readonly values: ReadonlyMap<string, unknown>) {}

  static fromOverrides(
    overrides: ReadonlyMap<string, string>,
    options: SettingsSnapshotOptions = {},
  ): SettingsSnapshot {
    const resolved = new Map<string, unknown>()

    for (const definition of SETTING_DEFINITIONS) {
      const raw = overrides.get(definition.key)

      if (raw === undefined) {
        resolved.set(definition.key, definition.default)
        continue
      }

      try {
        resolved.set(
          definition.key,
          coerce(definition as SettingDefinition<unknown>, raw),
        )
      } catch (error) {
        options.onInvalid?.(
          definition.key,
          raw,
          error instanceof Error ? error.message : String(error),
        )
        resolved.set(definition.key, definition.default)
      }
    }

    return new SettingsSnapshot(resolved)
  }

  get<K extends SettingKey>(key: K): SettingValue<K> {
    return this.values.get(key) as SettingValue<K>
  }

  toObject(): Record<string, unknown> {
    return Object.fromEntries(this.values)
  }
}

export interface SaveResult {
  changed: string[]
  invalidates: string[]
}

export async function saveSettings(
  repository: SettingsRepository,
  updates: Readonly<Record<string, unknown>>,
  current: SettingsSnapshot,
): Promise<SaveResult> {
  const toWrite = new Map<string, string>()
  const toDelete: string[] = []
  const changed: string[] = []
  const invalidates = new Set<string>()
  const errors: string[] = []

  for (const [key, value] of Object.entries(updates)) {
    const definition = SETTING_DEFINITION_BY_KEY.get(key)

    if (!definition) {
      errors.push(`Unknown setting "${key}".`)
      continue
    }

    const parsed = definition.schema.safeParse(value)
    if (!parsed.success) {
      errors.push(`${key}: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
      continue
    }

    if (Object.is(parsed.data, current.get(key as SettingKey))) {
      continue
    }

    changed.push(key)
    for (const tag of definition.invalidates ?? []) invalidates.add(tag)

    if (Object.is(parsed.data, definition.default)) {
      toDelete.push(key)
    } else {
      toWrite.set(key, serialise(parsed.data))
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(`Invalid settings: ${errors.join(' ')}`)
  }

  if (toWrite.size > 0) await repository.save(toWrite)
  if (toDelete.length > 0) await repository.delete(toDelete)

  return { changed, invalidates: [...invalidates] }
}
