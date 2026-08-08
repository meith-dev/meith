/**
 * A parameterised in-memory `AuthorizationSource`.
 *
 * Distinct from the `MemoryAuthorizationSource` in `fixture.ts`: that one bakes
 * in the exact F22 matrix board as module constants and exists to drive the
 * permission-matrix suite. This one takes its data as constructor input, so the
 * composition root can seed it with a small default board for `DATA_SOURCE=
 * fixture` (local dev, demos, and the app's own smoke tests) without dragging
 * the F22 test data into runtime — a change to the matrix fixture must never
 * silently change how the running app behaves.
 *
 * Pure: imports only this package's own types (which import only `@meith/core`),
 * so it stays inside the authorization boundary and needs no database.
 */
import type {
  ModeratorAppointment,
  AuthorizationSource,
  CommunityOverride,
  GroupDefaults,
} from './types'

/** The data an in-memory board is built from. */
export interface MemoryBoard {
  /** Global defaults per group. */
  readonly groups: readonly GroupDefaults[]
  /**
   * Ancestor chains keyed by community id, nearest-first and inclusive, matching
   * the port contract. A community absent from this map resolves to an empty chain
   * (i.e. "does not exist"), so callers must list every real community here.
   */
  readonly chains: Readonly<Record<number, readonly number[]>>
  /** Per-(community, group) overrides. */
  readonly overrides: readonly CommunityOverride[]
  /**
   * Moderator appointments (F48). Optional so every existing fixture board — a
   * board with no appointments is a perfectly ordinary board — keeps compiling.
   */
  readonly moderators?: readonly MemoryAppointment[]
}

/** An appointment plus who it is for; the port hides the who. */
export type MemoryAppointment = ModeratorAppointment & {
  readonly userId?: number | null
  readonly groupId?: number | null
}

export class InMemoryAuthorizationSource implements AuthorizationSource {
  private readonly groupsById: Map<number, GroupDefaults>

  constructor(private readonly board: MemoryBoard) {
    this.groupsById = new Map(board.groups.map((g) => [g.groupId, g]))
  }

  async groupDefaults(
    groupIds: readonly number[],
  ): Promise<readonly GroupDefaults[]> {
    const out: GroupDefaults[] = []
    for (const id of groupIds) {
      const g = this.groupsById.get(id)
      if (g) out.push(g)
    }
    return out
  }

  async ancestorChain(communityId: number): Promise<readonly number[]> {
    return this.board.chains[communityId] ?? []
  }

  async communityOverrides(
    communityIds: readonly number[],
    groupIds: readonly number[],
  ): Promise<readonly CommunityOverride[]> {
    const fset = new Set(communityIds)
    const gset = new Set(groupIds)
    return this.board.overrides.filter(
      (o) => fset.has(o.communityId) && gset.has(o.groupId),
    )
  }

  async allCommunityIds(): Promise<readonly number[]> {
    return Object.keys(this.board.chains).map((k) => Number(k))
  }

  async allAncestorChains(): Promise<ReadonlyMap<number, readonly number[]>> {
    return new Map(
      Object.entries(this.board.chains).map(([id, chain]) => [Number(id), chain]),
    )
  }

  async moderatorAppointments(
    userId: number | null,
    groupIds: readonly number[],
  ): Promise<readonly ModeratorAppointment[]> {
    const groups = new Set(groupIds)
    return (this.board.moderators ?? []).filter(
      (row) =>
        (row.userId != null && row.userId === userId) ||
        (row.groupId != null && groups.has(row.groupId)),
    )
  }
}
