import 'server-only'

/**
 * The fixture-mode `ActorSource` (Checkpoint 1 parity, no database).
 *
 * `ActorBuilder` in `@forum/db` is the production implementation, but it reads
 * Drizzle. When `DATA_SOURCE=fixture` there is no database, yet register/login/
 * reset must still work end-to-end in the preview — the user explicitly wants
 * full fixture parity. So this builds the exact same `Actor` shape from two
 * in-memory sources the composition root already owns:
 *
 *  - the account row (state, primary group) from the `@forum/accounts`
 *    in-memory store, and
 *  - the group permission defaults from `SEED_BOARD` (the same board the
 *    fixture authorization source uses), combined with the very same
 *    `combinePermissionSets` the database path calls.
 *
 * Because both paths funnel through `combinePermissionSets`, a fixture actor and
 * a Postgres actor with the same groups resolve to byte-identical permissions —
 * which is the whole point of parity: the demo behaves like production.
 */
import {
  combinePermissionSets,
  type Actor,
  type ActorSource,
  type ActorState,
  type GroupDefaults,
} from '@forum/authorization'
import type { AccountStore } from '@forum/accounts'
import { emptyPermissionSet } from '@forum/core'

import { SEED_BOARD, SEED_GROUP } from './seed-board'

/** Map the store's account state to the authorizer's ActorState. */
function mapState(state: 'active' | 'awaiting_activation' | 'banned'): ActorState {
  // The in-memory store's AccountState has no `awaiting_approval`, so this is a
  // total mapping — every case is a real ActorState.
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

    // A fixture account has only its primary group (the in-memory store models
    // no secondary memberships), and it always has one because register() lands
    // every new member in defaultMemberGroupId.
    // eslint-disable-next-line no-restricted-properties -- F20: reading the user's own primary group to assemble the actor's group ladder, exactly as ActorBuilder does in @forum/db
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
