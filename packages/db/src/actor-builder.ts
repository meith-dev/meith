/**
 * Actor construction (F20): turn a user id — or nobody — into the fully
 * resolved `Actor` the authorizer consumes.
 *
 * This is the one place that combines a user's groups. `Actor.global` must
 * already be the R4.2 combination across every group by the time the authorizer
 * sees it (the authorizer is pure and never queries), so the combine happens
 * here via `combinePermissionSets` — the exact same function the fixture uses,
 * so database-backed and in-memory actors resolve identically.
 *
 * `permissionVersion` is read from `cache_versions['permissions']`: it is the
 * global cache key from F20, and bumping that row invalidates every cached actor
 * at once. A missing row means "never bumped" -> version 1.
 */
import { eq, inArray } from 'drizzle-orm'

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

/** DB `users.state` -> the authorizer's `ActorState`. */
function mapState(dbState: string): ActorState | 'deleted' {
  switch (dbState) {
    case 'active':
      return 'active'
    // The DB distinguishes email-activation from admin-approval, but the
    // authorizer only cares that the account is not yet fully active: both are
    // the read-mostly `awaiting_activation` state. Collapsing them here (rather
    // than adding a fourth ActorState) keeps the permission gate simple.
    case 'awaiting_activation':
    case 'awaiting_approval':
      return 'awaiting_activation'
    case 'banned':
      return 'banned'
    default:
      // 'deleted' or anything unexpected: not a principal that can act.
      return 'deleted'
  }
}

export interface ActorBuilderConfig {
  /**
   * The group every unauthenticated visitor belongs to. Guests are never in an
   * empty group — an anonymous request still resolves a real permission set (the
   * guest group's), which is what lets a public community be readable with no login.
   */
  readonly guestGroupId: number
}

export class ActorBuilder implements ActorSource {
  constructor(
    private readonly db: Database,
    private readonly config: ActorBuilderConfig,
  ) {}

  /** The anonymous principal: the guest group, no user id, `guest` state. */
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

  /**
   * Resolve the principal behind a user id. Returns null when the user does not
   * exist or is deleted, so the caller falls back to `buildGuest()` rather than
   * minting an actor for a non-principal.
   */
  async buildForUser(userId: number): Promise<Actor | null> {
    const userRows = await this.db
      .select({
        id: users.id,
        state: users.state,
        // F20 sanctioned per-line disable (D13/D15): reading the persisted
        // primary-group column to *transport* it into the Actor is not an
        // authorization decision — the authorizer decides from `global`, never
        // from a group id. Nothing here branches on the value.
        // eslint-disable-next-line no-restricted-properties -- F20: group-id transport, not a decision
        primaryGroupId: users.primaryGroupId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    const user = userRows[0]
    if (!user) return null

    const state = mapState(user.state)
    if (state === 'deleted') return null

    // Primary group + every secondary membership, de-duplicated. Order is
    // irrelevant: combinePermissionSets is commutative (R4.2 is max/OR/AND).
    const membershipRows = await this.db
      .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, userId))

    // eslint-disable-next-line no-restricted-properties -- F20: reading the user's own primary group to assemble the actor's group ladder, not an authz decision
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

  /** Load each group's defaults and fold them into one set via R4.2. */
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
