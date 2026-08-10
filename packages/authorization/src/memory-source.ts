import type {
  ModeratorAppointment,
  AuthorizationSource,
  ForumOverride,
  GroupDefaults,
} from './types'

export interface MemoryBoard {
  readonly groups: readonly GroupDefaults[]
  readonly chains: Readonly<Record<number, readonly number[]>>
  readonly overrides: readonly ForumOverride[]
  readonly moderators?: readonly MemoryAppointment[]
}

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
