import 'server-only'

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

export function promotionRuleRepository(): PostgresPromotionRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresPromotionRepository(getDb())
    : null
}

export function requirePromotionRules(): PostgresPromotionRepository {
  const repository = promotionRuleRepository()
  if (repository === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so its promotion rules cannot be edited.',
    )
  }
  return repository
}

export async function previewPromotions(limit = 500): Promise<PromotionRunResult | null> {
  if (getContainer().dataSource !== 'postgres') return null

  const service = new PromotionService({
    promotions: new PostgresPromotionRepository(getDb()),
    guards: defaultPromotionGuards(),
  })
  return service.preview(limit)
}

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
