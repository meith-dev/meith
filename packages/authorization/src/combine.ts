import {
  PERMISSION_FIELDS,
  emptyPermissionSet,
  type PermissionField,
  type PermissionSet,
} from '@meith/core'

export function combineGroupValue(
  kind: PermissionField['kind'],
  values: readonly (boolean | number)[],
): boolean | number {
  switch (kind) {
    case 'boolean': {
      return values.some((v) => v === true)
    }
    case 'numeric': {
      const nums = values.map(Number)
      if (nums.some((n) => n === 0)) return 0
      return nums.reduce((a, b) => Math.max(a, b), 0)
    }
    case 'negative': {
      return values.every((v) => v === true)
    }
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unhandled permission kind: ${String(_exhaustive)}`)
    }
  }
}

export function combinePermissionSets(
  sets: readonly PermissionSet[],
): PermissionSet {
  if (sets.length === 0) return emptyPermissionSet()
  if (sets.length === 1) return { ...sets[0]! }

  const out = emptyPermissionSet() as Record<string, boolean | number>

  for (const field of PERMISSION_FIELDS) {
    const values = sets.map((s) => (s as Record<string, boolean | number>)[field.key]!)
    out[field.key] = combineGroupValue(field.kind, values)
  }

  return out as PermissionSet
}
