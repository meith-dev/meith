import 'server-only'

/**
 * F65 at the app layer.
 *
 * Assembles what the matrix editor needs, which is more than one query's worth:
 * the forum, its **ancestor chain** (so a cell can say what it inherits and
 * from where), every group, and the overrides on all of them.
 *
 * The chain is read from `forums.path` rather than by walking parents in a
 * loop — F16 maintains the dot-path for exactly this, and a loop would be one
 * query per level of a tree an operator is allowed to nest arbitrarily.
 */
import { ForbiddenError, type PermissionSet } from '@forum/core'
import {
  buildPermissionMatrix,
  planCopyToDescendants,
  type CopyPlan,
  type ForumOverride,
  type MatrixRow,
} from '@forum/authorization'
import type { ForumRow } from '@forum/forums'
import { PostgresForumAdminRepository, getDb } from '@forum/db'

import { getContainer } from './container'

export function forumAdminRepository(): PostgresForumAdminRepository | null {
  /*
   * Gated on the container's data source rather than on its own null, because
   * this repository is built here and not wired through `Container` — it is
   * used by three ACP screens and nothing else, and a field on the container
   * would be a field every test double has to carry.
   */
  return getContainer().dataSource === 'postgres'
    ? new PostgresForumAdminRepository(getDb())
    : null
}

export function requireForumAdmin(): PostgresForumAdminRepository {
  const repository = forumAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so its forums cannot be edited.',
    )
  }
  return repository
}

/** `[forumId, parentId, …, rootId]` — nearest first, as the resolver expects. */
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

/**
 * Every group, with its defaults.
 *
 * The defaults are the bottom of the resolution (R4.1 layer 1), so a cell that
 * inherits all the way up has to fall back to them — which is what lets the
 * screen say "inherit → allowed, by the group's own default" rather than
 * "inherit → ?".
 */
async function allGroups(
  repository: PostgresForumAdminRepository,
): Promise<readonly GroupRow[]> {
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

  /*
   * The chain *and* the subtree in one read: the matrix needs the ancestors to
   * resolve inheritance, and the copy preview needs the descendants to say what
   * it would replace.
   */
  const overrides = await repository.readOverrides([
    ...chain,
    ...descendants.map((row) => row.id),
  ])

  return {
    forum,
    chain,
    overrides,
    descendants,
    groups: groups.map(({ groupId, title }) => ({ groupId, title })),
    rows: buildPermissionMatrix({ chain, groups, overrides }),
  }
}

/** What copying this forum's overrides down its subtree would change. */
export function previewCopy(view: ForumMatrixView): CopyPlan {
  return planCopyToDescendants({
    sourceForumId: view.forum.id,
    descendantIds: view.descendants.map((row) => row.id),
    groupIds: view.groups.map((group) => group.groupId),
    overrides: view.overrides,
  })
}
