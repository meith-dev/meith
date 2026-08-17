import { eq, inArray } from 'drizzle-orm'

import type { Actor, ActorSource, ActorState } from '@meith/authorization'
import { combinePermissionSets } from '@meith/authorization'
import { emptyPermissionSet } from '@meith/core'

import type { Database } from './client'
import { groupRowToPermissionSet } from './permissions-map'
import { cacheVersions, userGroupMemberships, usergroups, users } from './schema'

function mapState(dbState: string): ActorState | 'deleted' {
  switch (dbState) {
    case 'active':
      return 'active'
    case 'awaiting_activation':
    case 'awaiting_approval':
      return 'awaiting_activation'
    case 'banned':
      return 'banned'
    default:
      return 'deleted'
  }
}

export interface ActorBuilderConfig {
  readonly guestGroupId: number
}

export class ActorBuilder implements ActorSource {
  constructor(
    private readonly db: Database,
    private readonly config: ActorBuilderConfig,
  ) {}

  async buildGuest(): Promise<Actor> {
    const groupIds = [this.config.guestGroupId]
    const global = await this.combineGroups(groupIds)
    return {
      userId: null,
      groupIds,
      primaryGroupId: this.config.guestGroupId,
      state: 'guest',
      global,
      permissionVersion: await this.permissionVersion(),
    }
  }

  async buildForUser(userId: number): Promise<Actor | null> {
    const userRows = await this.db
      .select({
        id: users.id,
        state: users.state,
        primaryGroupId: users.primaryGroupId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    const user = userRows[0]
    if (!user) return null

    const state = mapState(user.state)
    if (state === 'deleted') return null

    const now = new Date()
    const membershipRows = await this.db
      .select({
        groupId: userGroupMemberships.groupId,
        expiresAt: userGroupMemberships.expiresAt,
        previousPrimaryGroupId: userGroupMemberships.previousPrimaryGroupId,
      })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, userId))

    const live = membershipRows.filter(
      (r) => r.expiresAt === null || r.expiresAt.getTime() > now.getTime(),
    )

    const held = user.primaryGroupId
    const lapsed = membershipRows.find(
      (r) =>
        r.groupId === held &&
        r.previousPrimaryGroupId !== null &&
        r.expiresAt !== null &&
        r.expiresAt.getTime() <= now.getTime(),
    )

    const primaryGroupId = lapsed?.previousPrimaryGroupId ?? held
    const groupIds = dedupe([primaryGroupId, ...live.map((r) => r.groupId)])

    const global = await this.combineGroups(groupIds)

    return {
      userId: user.id,
      groupIds,
      primaryGroupId,
      state,
      global,
      permissionVersion: await this.permissionVersion(),
    }
  }

  private async combineGroups(groupIds: readonly number[]) {
    if (groupIds.length === 0) return emptyPermissionSet()

    const rows = await this.db
      .select()
      .from(usergroups)
      .where(inArray(usergroups.id, [...groupIds]))

    if (rows.length === 0) return emptyPermissionSet()

    return combinePermissionSets(
      rows.map((row) => groupRowToPermissionSet(row as Record<string, unknown>)),
    )
  }

  private async permissionVersion(): Promise<number> {
    const rows = await this.db
      .select({ version: cacheVersions.version })
      .from(cacheVersions)
      .where(eq(cacheVersions.key, 'permissions'))
      .limit(1)
    return rows[0]?.version ?? 1
  }
}

function dedupe(ids: readonly number[]): number[] {
  return [...new Set(ids)]
}
