export const RELATION_KINDS = ['buddy', 'ignore'] as const
export type RelationKind = (typeof RELATION_KINDS)[number]

export function parseRelationKind(value: string): RelationKind | null {
  return RELATION_KINDS.includes(value as RelationKind) ? (value as RelationKind) : null
}

export const MAX_RELATIONS = 200

export const ONLINE_WINDOW_MINUTES = 15

export function isOnline(lastActiveAt: Date | null, now: Date): boolean {
  if (lastActiveAt === null) return false
  return now.getTime() - lastActiveAt.getTime() <= ONLINE_WINDOW_MINUTES * 60_000
}

export interface RelationRow {
  readonly userId: number
  readonly username: string
  readonly kind: RelationKind
  readonly lastActiveAt: Date | null
  readonly createdAt: Date
}

export interface RelationRepository {
  list(input: {
    readonly userId: number
    readonly kind: RelationKind
  }): Promise<readonly RelationRow[]>

  count(userId: number): Promise<number>

  ignoredIds(userId: number): Promise<readonly number[]>

  set(input: {
    readonly userId: number
    readonly otherUserId: number
    readonly kind: RelationKind
    readonly at: Date
  }): Promise<void>

  remove(input: { readonly userId: number; readonly otherUserId: number }): Promise<boolean>

  ignores(ownerUserId: number, otherUserId: number): Promise<boolean>
}
