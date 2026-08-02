/**
 * F65 — the model behind the permission matrix editor.
 *
 * Here rather than in the app because it is permission reasoning, and R4 keeps
 * that inside this package. What an operator is shown, and what their edits
 * mean, has to agree with `resolve.ts` exactly — so this *calls* the resolver
 * rather than restating the rule.
 *
 * ## Why a cell is three states and not a checkbox
 *
 * `forum_permissions` columns are nullable and **null means inherit** (R4.1
 * layer 2). A two-state checkbox cannot express that: it would force every
 * operator opening a forum's permissions to write an explicit value for every
 * field, which pins the whole matrix at that forum forever and makes a later
 * change at the parent invisible. Every board where "I changed it at the top
 * and nothing happened" is true has this bug.
 *
 * So a cell is `inherit | grant | deny`, and the third state is the default.
 *
 * ## Why every cell carries what it resolves to
 *
 * "Inherit" on its own tells an operator nothing — inherit *what*? So each cell
 * reports the value it currently resolves to and, when that came from an
 * ancestor, which one. That is the difference between a matrix somebody can
 * reason about and a grid of tri-states they will get wrong.
 *
 * `inheritedFrom: null` with an inherited value means the whole chain was null
 * and the group's own default applies — which is a different explanation and
 * needs to read differently.
 *
 * ## The effective value is per group, deliberately
 *
 * `Authorizer.forumMatrix` combines across an actor's groups (R4.2: booleans
 * OR, numerics MAX). A matrix editor must **not** do that: the operator is
 * editing one group's row, and showing them a value that a different group
 * would win would make every cell a lie. So each row resolves as if that group
 * were the actor's only one — which is exactly what the stored row means.
 */
import {
  FORUM_PERMISSION_FIELDS,
  type ForumPermissions,
  type PermissionField,
} from '@forum/core'

import { resolveForumMatrix } from './resolve'
import type { ForumOverride, GroupDefaults } from './types'

/** What one cell of the grid is set to, and what that produces. */
export interface MatrixCell {
  readonly key: string
  /** The registry's own words. There is no second copy of them. */
  readonly description: string
  readonly kind: PermissionField['kind']
  /** This forum's own stored value. `null` is inherit, and is the common case. */
  readonly stored: boolean | number | null
  /** What the cell resolves to for this group, after the ancestor walk. */
  readonly effective: boolean | number
  /**
   * Which forum supplied the effective value when this forum did not.
   *
   * `null` while `stored` is also null means nothing in the chain set it and
   * the group's global default applies — a different explanation, which the
   * screen words differently.
   */
  readonly inheritedFrom: number | null
}

export interface MatrixRow {
  readonly groupId: number
  readonly groupTitle: string
  readonly cells: readonly MatrixCell[]
}

export interface MatrixInput {
  /** Forum ids from the target up to the root, nearest first, inclusive. */
  readonly chain: readonly number[]
  readonly groups: readonly (GroupDefaults & { readonly title: string })[]
  readonly overrides: readonly ForumOverride[]
}

function index(overrides: readonly ForumOverride[]): Map<string, ForumOverride> {
  const map = new Map<string, ForumOverride>()
  for (const override of overrides) map.set(`${override.forumId}:${override.groupId}`, override)
  return map
}

/** The nearest ancestor that sets `key` for `groupId`, or null. */
function sourceOf(
  chain: readonly number[],
  groupId: number,
  key: string,
  byForumGroup: ReadonlyMap<string, ForumOverride>,
): number | null {
  for (const forumId of chain) {
    const value = byForumGroup.get(`${forumId}:${groupId}`)?.overrides[
      key as keyof ForumPermissions
    ]
    if (value !== undefined && value !== null) return forumId
  }
  return null
}

export function buildPermissionMatrix(input: MatrixInput): readonly MatrixRow[] {
  const byForumGroup = index(input.overrides)
  const forumId = input.chain[0]

  return input.groups.map((group) => {
    /*
     * One group at a time. See the header: combining across groups here would
     * show the operator a number some *other* group produced, on a row they
     * believe they are editing.
     */
    const resolved = resolveForumMatrix(input.chain, [group], byForumGroup)
    const own = forumId === undefined ? undefined : byForumGroup.get(`${forumId}:${group.groupId}`)

    return {
      groupId: group.groupId,
      groupTitle: group.title,
      cells: FORUM_PERMISSION_FIELDS.map((field) => {
        const stored = own?.overrides[field.key as keyof ForumPermissions]
        const source = sourceOf(input.chain, group.groupId, field.key, byForumGroup)

        return {
          key: field.key,
          description: field.description,
          kind: field.kind,
          stored: stored === undefined ? null : stored,
          effective: resolved[field.key as keyof ForumPermissions] as boolean | number,
          /* Only report an ancestor when this forum is not the source. */
          inheritedFrom: source === null || source === forumId ? null : source,
        }
      }),
    }
  })
}

/* ------------------------------------------------------------------ *
 * Copying a forum's permissions down its subtree
 * ------------------------------------------------------------------ */

export interface CopyChange {
  readonly forumId: number
  readonly groupId: number
  readonly key: string
  readonly from: boolean | number | null
  readonly to: boolean | number | null
}

export interface CopyPlan {
  readonly changes: readonly CopyChange[]
  /** Descendants the copy would leave exactly as they are. */
  readonly unchanged: readonly number[]
}

/**
 * What copying this forum's stored overrides to its descendants would do.
 *
 * **A plan, not a write.** Copy-to-subforums is the single most destructive
 * button in a forum administration screen: it overwrites work somebody did
 * deliberately, on forums they are not looking at, and there is no undo. So the
 * screen shows exactly which cells on which forums would change before anything
 * happens, and this is the function that answers it.
 *
 * What is copied is this forum's **stored** values, nulls included. Copying only
 * the non-nulls would be the more cautious-sounding choice and is wrong: a
 * descendant that explicitly denies something the source inherits would keep
 * denying it, so "copy" would not have copied. Making a descendant *identical*
 * is the only meaning of the word that an operator can predict.
 */
export function planCopyToDescendants(input: {
  readonly sourceForumId: number
  readonly descendantIds: readonly number[]
  readonly groupIds: readonly number[]
  readonly overrides: readonly ForumOverride[]
}): CopyPlan {
  const byForumGroup = index(input.overrides)
  const changes: CopyChange[] = []
  const touched = new Set<number>()

  for (const forumId of input.descendantIds) {
    for (const groupId of input.groupIds) {
      const source = byForumGroup.get(`${input.sourceForumId}:${groupId}`)?.overrides ?? {}
      const target = byForumGroup.get(`${forumId}:${groupId}`)?.overrides ?? {}

      for (const field of FORUM_PERMISSION_FIELDS) {
        const key = field.key as keyof ForumPermissions
        const from = (target[key] ?? null) as boolean | number | null
        const to = (source[key] ?? null) as boolean | number | null

        if (Object.is(from, to)) continue
        changes.push({ forumId, groupId, key: field.key, from, to })
        touched.add(forumId)
      }
    }
  }

  return {
    changes,
    unchanged: input.descendantIds.filter((id) => !touched.has(id)),
  }
}

/**
 * Read a submitted matrix row back into an override.
 *
 * Takes the raw form values so the caller does no parsing of its own — the
 * three states are `''` (inherit), `'1'`/`'0'` for a boolean, and a number for
 * a numeric field. An unparseable numeric is returned as `null` rather than as
 * `NaN` or `0`: a typo must mean "inherit", never "unlimited", because 0 is
 * meaningful (R4.2) and would silently grant the opposite of what was typed.
 */
export function readMatrixCell(
  field: PermissionField,
  raw: string | undefined,
): boolean | number | null {
  if (raw === undefined || raw === '' || raw === 'inherit') return null

  if (field.kind === 'boolean') {
    if (raw === '1' || raw === 'grant') return true
    if (raw === '0' || raw === 'deny') return false
    return null
  }

  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}
