import 'server-only'

import {
  combinePermissionSets,
  type Actor,
  type ActorSource,
  type ActorState,
  type GroupDefaults,
} from '@meith/authorization'
import type { AccountStore } from '@meith/accounts'
import { emptyPermissionSet } from '@meith/core'

import { SEED_BOARD, SEED_GROUP } from './seed-board'

function mapState(state: 'active' | 'awaiting_activation' | 'banned'): ActorState {
  return state
}

export class FixtureActorSource implements ActorSource {
  private readonly groupsById: Map<number, GroupDefaults>

  constructor(private readonly store: AccountStore) {
    this.groupsById = new Map(SEED_BOARD.groups.map((g) => [g.groupId, g]))
  }

  async buildGuest(): Promise<Actor> {
    const groupIds = [SEED_GROUP.guest]
    return {
      userId: null,
      groupIds,
      primaryGroupId: SEED_GROUP.guest,
      state: 'guest',
      global: this.combine(groupIds),
      permissionVersion: 1,
    }
  }

  async buildForUser(userId: number): Promise<Actor | null> {
    const account = await this.store.accounts.findById(userId)
    if (!account) return null

    // eslint-disable-next-line no-restricted-properties -- reading the user's own primary group to assemble the actor's group ladder, exactly as ActorBuilder does in @meith/db
    const primaryGroupId = account.primaryGroupId ?? SEED_GROUP.registered
    const groupIds = [primaryGroupId]

    return {
      userId: account.id,
      groupIds,
      primaryGroupId,
      state: mapState(account.state),
      global: this.combine(groupIds),
      permissionVersion: 1,
    }
  }

  private combine(groupIds: readonly number[]) {
    const sets = groupIds
      .map((id) => this.groupsById.get(id)?.permissions)
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
    if (sets.length === 0) return emptyPermissionSet()
    return combinePermissionSets(sets)
  }
}
