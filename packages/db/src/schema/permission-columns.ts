import { boolean, integer } from 'drizzle-orm/pg-core'

import { PERMISSION_FIELDS, type PermissionField, type PermissionScope } from '@meith/core'

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

export function groupPermissionColumns() {
  const out: Record<string, ReturnType<typeof declare>> = {}
  for (const field of PERMISSION_FIELDS) {
    out[field.key] = declare(field, false)
  }
  return out
}

export function forumPermissionColumns() {
  const out: Record<string, ReturnType<typeof declare>> = {}
  for (const field of PERMISSION_FIELDS) {
    if ((field.scope satisfies PermissionScope) !== 'forum') continue
    out[field.key] = declare(field, true)
  }
  return out
}
