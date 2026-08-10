import {
  FORUM_PERMISSION_FIELDS,
  PERMISSION_FIELDS,
  emptyPermissionSet,
  type ForumPermissions,
  type PermissionField,
  type PermissionSet,
} from '@meith/core'

export type PermissionRow = Record<string, unknown>

function coerceField(field: PermissionField, raw: unknown): boolean | number | undefined {
  if (raw === null || raw === undefined) return undefined

  if (field.kind === 'numeric') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n)) {
      throw new TypeError(
        `Permission field "${field.key}" expected a number, got ${JSON.stringify(raw)}`,
      )
    }
    return n
  }

  if (typeof raw === 'boolean') return raw
  if (raw === 't' || raw === 1 || raw === '1') return true
  if (raw === 'f' || raw === 0 || raw === '0') return false

  throw new TypeError(
    `Permission field "${field.key}" expected a boolean, got ${JSON.stringify(raw)}`,
  )
}

export function groupRowToPermissionSet(row: PermissionRow): PermissionSet {
  const out = emptyPermissionSet()
  for (const field of PERMISSION_FIELDS) {
    const value = coerceField(field, row[field.key])
    if (value !== undefined) {
      ;(out as Record<string, boolean | number>)[field.key] = value
    }
  }
  return out
}

export function forumRowToOverride(row: PermissionRow): Partial<ForumPermissions> {
  const out: Record<string, boolean | number> = {}
  for (const field of FORUM_PERMISSION_FIELDS) {
    const value = coerceField(field, row[field.key])
    if (value !== undefined) out[field.key] = value
  }
  return out as Partial<ForumPermissions>
}
