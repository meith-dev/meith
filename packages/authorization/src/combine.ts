/**
 * The R4.2 combination rules, encoded once from the field `kind`.
 *
 * This is the single most error-prone calculation in the product, so it is a
 * pure function over plain values with no I/O: the F20 acceptance test ("a user
 * in three groups resolves to the correct combined set") is a table of inputs
 * and outputs against `combineGroupValue` and `combinePermissionSets`.
 */
import {
  PERMISSION_FIELDS,
  emptyPermissionSet,
  type PermissionField,
  type PermissionSet,
} from '@forum/core'

/**
 * Combine one field's value across the groups a user belongs to.
 *
 * The three rules are genuinely different, and two of them are the opposite of
 * the naive implementation:
 *
 *   - `boolean`  — OR. Any group granting it wins.
 *   - `numeric`  — MAX, EXCEPT that 0 means "unlimited" and therefore beats
 *                  every finite value. `Math.max` alone gets this backwards:
 *                  max(0, 5) is 5, but the correct answer is 0/unlimited.
 *   - `negative` — AND. The stored `true` is a *restriction*, so a single group
 *                  that sets it `false` (exempt) frees the user. Reducing with
 *                  OR would mean one restrictive group re-restricts everyone.
 *
 * Exhaustive `switch` with a `never` default: adding a fourth kind to the
 * registry fails to compile here until this function handles it.
 */
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
      // 0 = unlimited short-circuits the whole max.
      if (nums.some((n) => n === 0)) return 0
      return nums.reduce((a, b) => Math.max(a, b), 0)
    }
    case 'negative': {
      // AND: restricted only if EVERY group restricts. Any `false` exempts.
      return values.every((v) => v === true)
    }
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unhandled permission kind: ${String(_exhaustive)}`)
    }
  }
}

/**
 * Reduce several groups' fully-populated permission sets into one.
 *
 * Every input set must have every key (group defaults always do — they are
 * stored as complete rows). The seed is the deny-by-default set so that an
 * actor with an empty group list is maximally restricted rather than undefined.
 */
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
