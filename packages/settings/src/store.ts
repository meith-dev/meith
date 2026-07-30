/**
 * F08 — reading and writing settings.
 *
 * Values live in the database as text and are coerced through each definition's
 * zod schema on read. A row whose text no longer parses (a hand-edited database,
 * a setting whose type was tightened in a later release) falls back to the
 * declared default rather than throwing: a malformed `display.posts_per_page`
 * should not take the whole board down.
 */

import { SETTING_DEFINITION_BY_KEY, SETTING_DEFINITIONS } from './definitions'
import type { SettingDefinition, SettingKey, SettingValue } from './definitions'

/** Storage seam. `@forum/settings` is a domain package (R2), so no @forum/db. */
export interface SettingsRepository {
  /** All persisted overrides. Defaults are *not* stored, only deviations. */
  loadAll(): Promise<ReadonlyMap<string, string>>
  save(entries: ReadonlyMap<string, string>): Promise<void>
  delete(keys: readonly string[]): Promise<void>
}

export interface SettingsSnapshotOptions {
  /** Called when a stored value fails validation, so it can be logged. */
  onInvalid?: (key: string, raw: string, reason: string) => void
}

/**
 * Serialises a value for storage.
 *
 * Booleans become "1"/"0" rather than "true"/"false" to match the numeric
 * convention already used by the permission columns, and because MyBB's own
 * settings table uses the same representation — relevant for importers (F80).
 */
function serialise(value: unknown): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/**
 * Parses stored text back through a definition's schema.
 *
 * The pre-coercion for booleans and numbers exists because everything arrives as
 * text; `z.boolean()` would reject the string "1" outright.
 */
function coerce(
  /*
   * Takes the erased `unknown` form rather than a generic `SettingDefinition<T>`:
   * iterating SETTING_DEFINITIONS yields a *union* of concrete definition types,
   * and TypeScript cannot pick a single T for a generic parameter from a union
   * argument. The return is `unknown` and narrowed by the caller's own key type.
   */
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

/**
 * An immutable, fully-resolved view of every setting.
 *
 * Built once per request (cached by F10's tag registry) and passed down, rather
 * than each call site hitting the database. `get` is synchronous so render code
 * never awaits a setting mid-tree.
 */
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
        /*
         * Fall back to the default rather than propagating. An invalid stored
         * value is an operator problem to fix, not a reason to serve 500s on
         * every page — but it must be visible, hence the callback.
         */
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

  /** Plain object form, for passing to client components and the admin UI. */
  toObject(): Record<string, unknown> {
    return Object.fromEntries(this.values)
  }
}

export interface SaveResult {
  /** Keys whose value actually changed — drives cache invalidation. */
  changed: string[]
  /** Cache tags the changed keys declare, de-duplicated. */
  invalidates: string[]
}

/**
 * Validates and persists a batch of settings.
 *
 * Validation happens for the whole batch *before* anything is written, so a
 * partially-valid admin form submission cannot leave settings half-applied.
 * Unknown keys are rejected rather than ignored: silently dropping them would
 * make a typo in the admin form look like a successful save.
 */
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

    /*
     * Storing a value equal to the default is pointless and makes a later
     * change of default invisible to existing installs, so delete the override
     * instead of writing it.
     */
    if (Object.is(parsed.data, definition.default)) {
      toDelete.push(key)
    } else {
      toWrite.set(key, serialise(parsed.data))
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid settings: ${errors.join(' ')}`)
  }

  if (toWrite.size > 0) await repository.save(toWrite)
  if (toDelete.length > 0) await repository.delete(toDelete)

  return { changed, invalidates: [...invalidates] }
}
