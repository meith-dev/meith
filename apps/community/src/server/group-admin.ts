import 'server-only'

/**
 * F66 at the app layer.
 *
 * Two things assembled here, both of which read more than one source.
 *
 * **The permission editor's rows.** A group's global permissions are the
 * *bottom* of the resolution (R4.1 layer 1) — there is no ancestor above them
 * and nothing to inherit from — so unlike F65's community matrix these cells have
 * two states, not three. The editor is built from the registry rather than from
 * a hand-written list of fields, so a permission added to `PERMISSION_FIELDS`
 * appears here without anybody remembering to add it.
 *
 * **The promotion dry run.** `PromotionService.preview()` has existed since
 * F24 and had no caller outside the scheduler; the screen is a caller, not a
 * second implementation. `preview()` and `apply()` differ only in whether the
 * outcomes are written, which is the property that stops a preview from ever
 * disagreeing with the run it is previewing.
 */
import { ForbiddenError, PERMISSION_FIELDS } from '@meith/core'
import type { PermissionField, PermissionSet } from '@meith/core'
import { PromotionService, type PromotionRunResult } from '@meith/groups'
import { defaultPromotionGuards } from '@meith/runtime'
import {
  PostgresGroupAdminRepository,
  PostgresPromotionRepository,
  getDb,
  type GroupSummaryRow,
} from '@meith/db'

import { getContainer } from './container'

export function groupAdminRepository(): PostgresGroupAdminRepository | null {
  /*
   * Gated on the container's data source, like `communityAdminRepository`: this is
   * used by four ACP screens and nothing else, and a field on `Container` would
   * be a field every test double has to carry.
   */
  return getContainer().dataSource === 'postgres'
    ? new PostgresGroupAdminRepository(getDb())
    : null
}

export function requireGroupAdmin(): PostgresGroupAdminRepository {
  const repository = groupAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so its groups cannot be edited.',
    )
  }
  return repository
}

/** One editable permission, with the value the group currently holds. */
export interface GroupPermissionCell {
  readonly key: string
  readonly description: string
  readonly kind: PermissionField['kind']
  readonly scope: PermissionField['scope']
  readonly value: boolean | number
}

export interface GroupPermissionView {
  readonly group: GroupSummaryRow
  readonly cells: readonly GroupPermissionCell[]
}

export async function buildGroupPermissionView(
  groupId: number,
): Promise<GroupPermissionView | null> {
  const repository = groupAdminRepository()
  if (repository === null) return null

  const group = (await repository.list()).find((row) => row.id === groupId)
  if (group === undefined) return null

  const permissions = await repository.readPermissions(groupId)
  if (permissions === null) return null

  return { group, cells: permissionCells(permissions) }
}

/**
 * Every field in the registry, in registry order.
 *
 * Including the `community`-scoped ones. They are a group's *default* answer for
 * every community that does not override them (R4.1 layer 1), so leaving them off
 * this screen would hide the value that most communities actually resolve to — an
 * operator would set `canPostThreads` nowhere and wonder why nobody can post.
 */
function permissionCells(permissions: PermissionSet): readonly GroupPermissionCell[] {
  return PERMISSION_FIELDS.map((field) => ({
    key: field.key,
    description: field.description,
    kind: field.kind,
    scope: field.scope,
    value:
      (permissions as unknown as Record<string, boolean | number>)[field.key] ??
      field.fallback,
  }))
}

/**
 * What a promotion run would do, without doing it.
 *
 * Returns `null` on a board with no Postgres behind it rather than throwing:
 * the screen renders an explanation, and a dry run is a read.
 */
export async function previewPromotions(limit = 500): Promise<PromotionRunResult | null> {
  if (getContainer().dataSource !== 'postgres') return null

  const service = new PromotionService({
    promotions: new PostgresPromotionRepository(getDb()),
    guards: defaultPromotionGuards(),
  })
  return service.preview(limit)
}

/** The promotion service the apply action uses — same construction, one place. */
export function promotionService(): PromotionService {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so promotions cannot run.',
    )
  }
  return new PromotionService({
    promotions: new PostgresPromotionRepository(getDb()),
    guards: defaultPromotionGuards(),
  })
}
