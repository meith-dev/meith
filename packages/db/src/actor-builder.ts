import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'

import { combinePermissionSets } from '@meith/authorization'
import type { Actor, ActorSource, ActorState } from '@meith/authorization'
import { emptyPermissionSet } from '@meith/core'

import type { Database } from './client'
import { groupRowToPermissionSet } from './permissions-map'
import {
  cacheVersions,
  usergroups,
  userGroupMemberships,
  users,
} from './schema'

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
        // eslint-disable-next-line no-restricted-properties -- group-id transport, not a decision
        primaryGroupId: users.primaryGroupId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    const user = userRows[0]
    if (!user) return null

    const state = mapState(user.state)
    if (state === 'deleted') return null

    const membershipRows = await this.db
      .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(
        and(
          eq(userGroupMemberships.userId, userId),
          or(
            isNull(userGroupMemberships.expiresAt),
            gt(userGroupMemberships.expiresAt, new Date()),
          ),
        ),
      )

    // eslint-disable-next-line no-restricted-properties -- reading the user's own primary group to assemble the actor's group ladder, not an authz decision
    const primaryGroupId = user.primaryGroupId
    const groupIds = dedupe([
      primaryGroupId,
      ...membershipRows.map((r) => r.groupId),
    ])

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
