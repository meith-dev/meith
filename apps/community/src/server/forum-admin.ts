import { msg } from '@meith/i18n'
import 'server-only'

import {
  buildFieldMatrix,
  buildPermissionMatrix,
  type CopyPlan,
  type FieldMatrixRow,
  type ForumOverride,
  type MatrixColumn,
  type MatrixRow,
  matrixColumns,
  planCopyToDescendants,
} from '@meith/authorization'
import { ForbiddenError, type PermissionSet } from '@meith/core'
import { getDb, PostgresForumAdminRepository } from '@meith/db'
import type { ForumRow } from '@meith/forums'

import { getContainer } from './container'

export function forumAdminRepository(): PostgresForumAdminRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresForumAdminRepository(getDb()) : null
}

export function requireForumAdmin(): PostgresForumAdminRepository {
  const repository = forumAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-12'))
  }
  return repository
}

export function ancestorChain(forum: ForumRow): readonly number[] {
  return forum.path
    .split('.')
    .map((segment) => Number(segment))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .reverse()
}

export interface ForumMatrixView {
  readonly forum: ForumRow
  readonly rows: readonly MatrixRow[]
  readonly columns: readonly MatrixColumn[]
  readonly fields: readonly FieldMatrixRow[]
  readonly chain: readonly number[]
  readonly overrides: readonly ForumOverride[]
  readonly groups: readonly { readonly groupId: number; readonly title: string }[]
  readonly descendants: readonly ForumRow[]
}

interface GroupRow {
  readonly groupId: number
  readonly title: string
  readonly permissions: PermissionSet
}

async function allGroups(repository: PostgresForumAdminRepository): Promise<readonly GroupRow[]> {
  const groups = await repository.listGroups()
  const defaults = await getContainer().authorizationSource.groupDefaults(
    groups.map((group) => group.id),
  )
  const byId = new Map(defaults.map((entry) => [entry.groupId, entry.permissions]))

  return groups.map((group) => ({
    groupId: group.id,
    title: group.title,
    permissions: byId.get(group.id) as PermissionSet,
  }))
}

export async function buildForumMatrixView(forumId: number): Promise<ForumMatrixView | null> {
  const repository = forumAdminRepository()
  const { forums } = getContainer()
  if (repository === null) return null

  const all = await forums.listAll()
  const forum = all.find((row) => row.id === forumId)
  if (forum === undefined) return null

  const chain = ancestorChain(forum)
  const groups = await allGroups(repository)
  const descendants = all.filter((row) => row.path.startsWith(`${forum.path}.`))

  const overrides = await repository.readOverrides([...chain, ...descendants.map((row) => row.id)])
  const rows = buildPermissionMatrix({ chain, groups, overrides })

  return {
    forum,
    chain,
    overrides,
    descendants,
    groups: groups.map(({ groupId, title }) => ({ groupId, title })),
    rows,
    columns: matrixColumns(rows),
    fields: buildFieldMatrix(rows),
  }
}

export function previewCopy(view: ForumMatrixView): CopyPlan {
  return planCopyToDescendants({
    sourceForumId: view.forum.id,
    descendantIds: view.descendants.map((row) => row.id),
    groupIds: view.groups.map((group) => group.groupId),
    overrides: view.overrides,
  })
}
