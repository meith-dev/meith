/**
 * Generates the permission columns for `usergroups` and `forum_permissions`
 * from the single registry in `@forum/core`.
 *
 * The two tables carry the same field list with different nullability:
 *
 *   - `usergroups`        — NOT NULL with a default. A group always has an answer.
 *   - `forum_permissions` — every column NULLABLE, where NULL means "inherit"
 *                           (R4.1 layer 2). Resolution walks the ancestor chain
 *                           and takes the first non-NULL.
 *
 * Writing these by hand would be ~90 column declarations kept in sync by hope.
 */

import { boolean, integer } from 'drizzle-orm/pg-core'

import {
  PERMISSION_FIELDS,
  type PermissionField,
  type PermissionScope,
} from '@forum/core'

/** camelCase key -> snake_case column name. See docs/mybb-parity.md. */
export function columnName(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function declare(field: PermissionField, nullable: boolean) {
  const name = columnName(field.key)
  if (field.kind === 'numeric') {
    const col = integer(name)
    return nullable ? col : col.notNull().default(field.fallback as number)
  }
  const col = boolean(name)
  return nullable ? col : col.notNull().default(field.fallback as boolean)
}

/**
 * NOT NULL permission columns for `usergroups`, one per registry field.
 * Defaults are the registry fallbacks (deny-by-default); the seed migration
 * then sets the real per-group values.
 */
export function groupPermissionColumns() {
  const out: Record<string, ReturnType<typeof declare>> = {}
  for (const field of PERMISSION_FIELDS) {
    out[field.key] = declare(field, false)
  }
  return out
}

/**
 * NULLABLE permission columns for `forum_permissions`, restricted to fields
 * whose scope is 'forum'. A global-only field such as `canUsePrivateMessages`
 * has no meaning attached to a single forum, and allowing it to be set there
 * would create a value that the resolver must then decide to ignore.
 */
export function forumPermissionColumns() {
  const out: Record<string, ReturnType<typeof declare>> = {}
  for (const field of PERMISSION_FIELDS) {
    if ((field.scope satisfies PermissionScope) !== 'forum') continue
    out[field.key] = declare(field, true)
  }
  return out
}
