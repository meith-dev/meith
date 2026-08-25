import { msg } from '@meith/i18n'
import 'server-only'

import type { PermissionField, PermissionSet } from '@meith/core'
import { ForbiddenError, PERMISSION_FIELDS } from '@meith/core'
import {
  type GroupSummaryRow,
  getDb,
  PostgresGroupAdminRepository,
  PostgresPromotionRepository,
} from '@meith/db'
import { type PromotionRunResult, PromotionService } from '@meith/groups'
import { defaultPromotionGuards } from '@meith/runtime'

import { getContainer } from './container'

export function groupAdminRepository(): PostgresGroupAdminRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresGroupAdminRepository(getDb()) : null
}

export function requireGroupAdmin(): PostgresGroupAdminRepository {
  const repository = groupAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-18'))
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
      (permissions as unknown as Record<string, boolean | number>)[field.key] ?? field.fallback,
  }))
}

export function promotionRuleRepository(): PostgresPromotionRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresPromotionRepository(getDb()) : null
}

export function requirePromotionRules(): PostgresPromotionRepository {
  const repository = promotionRuleRepository()
  if (repository === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-19'))
  }
  return repository
}

export async function previewPromotions(): Promise<PromotionRunResult | null> {
  if (getContainer().dataSource !== 'postgres') return null

  return promotionService().preview()
}

export function promotionService(): PromotionService {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-20'))
  }
  return new PromotionService({
    promotions: new PostgresPromotionRepository(getDb()),
    guards: defaultPromotionGuards(),
  })
}
