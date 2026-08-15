import {
  FORUM_PERMISSION_FIELDS,
  type ForumPermissions,
  type PermissionField,
} from '@meith/core'

import { resolveForumMatrix } from './resolve'
import type { ForumOverride, GroupDefaults } from './types'

export interface MatrixCell {
  readonly key: string
  readonly description: string
  readonly kind: PermissionField['kind']
  readonly stored: boolean | number | null
  readonly effective: boolean | number
  readonly inheritedFrom: number | null
}

export interface MatrixRow {
  readonly groupId: number
  readonly groupTitle: string
  readonly cells: readonly MatrixCell[]
}

export interface MatrixInput {
  readonly chain: readonly number[]
  readonly groups: readonly (GroupDefaults & { readonly title: string })[]
  readonly overrides: readonly ForumOverride[]
}

function index(overrides: readonly ForumOverride[]): Map<string, ForumOverride> {
  const map = new Map<string, ForumOverride>()
  for (const override of overrides) map.set(`${override.forumId}:${override.groupId}`, override)
  return map
}

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
          inheritedFrom: source === null || source === forumId ? null : source,
        }
      }),
    }
  })
}

export interface CopyChange {
  readonly forumId: number
  readonly groupId: number
  readonly key: string
  readonly from: boolean | number | null
  readonly to: boolean | number | null
}

export interface CopyPlan {
  readonly changes: readonly CopyChange[]
  readonly unchanged: readonly number[]
}

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

export function readMatrixCell(
  field: PermissionField,
  raw: string | undefined,
): boolean | number | null {
  if (raw === undefined || raw === '' || raw === 'inherit') return null

  if (field.kind === 'boolean' || field.kind === 'negative') {
    if (raw === '1' || raw === 'grant') return true
    if (raw === '0' || raw === 'deny') return false
    return null
  }

  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function matrixCellValue(
  cell: Pick<MatrixCell, 'kind' | 'stored'>,
): string {
  if (cell.stored === null) return cell.kind === 'numeric' ? '' : 'inherit'
  if (cell.kind === 'numeric') return String(cell.stored)
  return cell.stored === true ? 'grant' : 'deny'
}
