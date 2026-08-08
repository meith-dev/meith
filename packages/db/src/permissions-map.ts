/**
 * Row <-> PermissionSet mapping for the authorization layer.
 *
 * The Drizzle tables in `schema/permission-columns.ts` use the `@meith/core`
 * registry's camelCase keys as their JS property names, so a queried
 * `usergroups` row already carries `row.canView`, `row.maxAttachments`, and so
 * on. These mappers exist anyway, for three reasons that a raw `row as
 * PermissionSet` cast would silently get wrong:
 *
 *  1. **Completeness.** A `SELECT` that omits a column, or a group row written
 *     before a new permission field was added, would leave a key `undefined`.
 *     The authorizer treats `undefined` as neither true nor false and produces
 *     nonsense. Reducing over the registry guarantees every key is present, and
 *     falls back to the registry default when a value is missing.
 *
 *  2. **Type coercion.** A numeric column read through some driver paths arrives
 *     as a string (`"5"`). `Math.max("5", 3)` is `NaN`-adjacent nonsense. Each
 *     numeric field is coerced to a real number here, once.
 *
 *  3. **The null-means-inherit rule (R4.1 layer 2).** `forum_permissions`
 *     columns are nullable; null is *not* `false`, it means "defer to the
 *     parent forum". `forumRowToOverride` keeps only the non-null keys, which is
 *     exactly what the resolver's ancestor walk consumes.
 *
 * Keeping this in `@meith/db` (not `@meith/authorization`) is deliberate: it is
 * storage-shape knowledge. The authorizer receives already-clean domain objects.
 */
import {
  FORUM_PERMISSION_FIELDS,
  PERMISSION_FIELDS,
  emptyPermissionSet,
  type ForumPermissions,
  type PermissionField,
  type PermissionSet,
} from '@meith/core'

/** A row with permission columns, keyed by registry key (Drizzle's shape). */
export type PermissionRow = Record<string, unknown>

/**
 * Coerce one raw column value to the type its field declares.
 *
 * Returns `undefined` when the value is null/absent so callers can decide
 * whether that means "inherit" (forum override) or "use default" (group row).
 */
function coerceField(field: PermissionField, raw: unknown): boolean | number | undefined {
  if (raw === null || raw === undefined) return undefined

  if (field.kind === 'numeric') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    // A non-numeric string in a numeric column is data corruption, not a 0.
    // Surfacing it beats silently granting an unlimited (0) or zero allowance.
    if (!Number.isFinite(n)) {
      throw new TypeError(
        `Permission field "${field.key}" expected a number, got ${JSON.stringify(raw)}`,
      )
    }
    return n
  }

  // boolean and negative fields are both stored as booleans.
  if (typeof raw === 'boolean') return raw
  // Postgres booleans occasionally surface as 't'/'f' or 0/1 across drivers.
  if (raw === 't' || raw === 1 || raw === '1') return true
  if (raw === 'f' || raw === 0 || raw === '0') return false

  throw new TypeError(
    `Permission field "${field.key}" expected a boolean, got ${JSON.stringify(raw)}`,
  )
}

/**
 * Turn a `usergroups` row into a complete `PermissionSet`.
 *
 * Every registry key is present in the result. A key missing from the row (or
 * null) falls back to the registry default rather than becoming `undefined`,
 * so a group row that predates a newly-added field still resolves safely
 * (deny-by-default for grants, restricted for negatives).
 */
export function groupRowToPermissionSet(row: PermissionRow): PermissionSet {
  const out = emptyPermissionSet()
  for (const field of PERMISSION_FIELDS) {
    const value = coerceField(field, row[field.key])
    if (value !== undefined) {
      // Safe: keys and value-kinds both come from the same registry field.
      ;(out as Record<string, boolean | number>)[field.key] = value
    }
  }
  return out
}

/**
 * Turn a `forum_permissions` row into the partial override it represents.
 *
 * Only forum-scoped fields are considered, and only non-null values are kept:
 * a null column means "inherit from the parent", which the resolver handles by
 * this key simply being absent from the returned object (R4.1 layer 2).
 */
export function forumRowToOverride(row: PermissionRow): Partial<ForumPermissions> {
  const out: Record<string, boolean | number> = {}
  for (const field of FORUM_PERMISSION_FIELDS) {
    const value = coerceField(field, row[field.key])
    if (value !== undefined) out[field.key] = value
  }
  return out as Partial<ForumPermissions>
}
