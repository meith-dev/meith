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
 * Pure: imports only this package's own types (which import only `@forum/core`),
 * so it stays inside the authorization boundary and needs no database.
 */
import type {
  AuthorizationSource,
  ForumOverride,
  GroupDefaults,
} from './types'

/** The data an in-memory board is built from. */
export interface MemoryBoard {
  /** Global defaults per group. */
  readonly groups: readonly GroupDefaults[]
  /**
   * Ancestor chains keyed by forum id, nearest-first and inclusive, matching
   * the port contract. A forum absent from this map resolves to an empty chain
   * (i.e. "does not exist"), so callers must list every real forum here.
   */
  readonly chains: Readonly<Record<number, readonly number[]>>
  /** Per-(forum, group) overrides. */
  readonly overrides: readonly ForumOverride[]
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

  async ancestorChain(forumId: number): Promise<readonly number[]> {
    return this.board.chains[forumId] ?? []
  }

  async forumOverrides(
    forumIds: readonly number[],
    groupIds: readonly number[],
  ): Promise<readonly ForumOverride[]> {
    const fset = new Set(forumIds)
    const gset = new Set(groupIds)
    return this.board.overrides.filter(
      (o) => fset.has(o.forumId) && gset.has(o.groupId),
    )
  }

  async allForumIds(): Promise<readonly number[]> {
    return Object.keys(this.board.chains).map((k) => Number(k))
  }

  async allAncestorChains(): Promise<ReadonlyMap<number, readonly number[]>> {
    return new Map(
      Object.entries(this.board.chains).map(([id, chain]) => [Number(id), chain]),
    )
  }
}
