export interface MemberIdentity {
  readonly groupId: number
  readonly title: string
  readonly nameClass: string | null
  readonly badge: {
    readonly src: string
    readonly darkSrc: string | null
    readonly alt: string
  } | null
  readonly reputation: number
}

export function nameClassOf(
  identities: ReadonlyMap<number, MemberIdentity> | undefined,
  userId: number | null,
): string | null {
  if (identities === undefined || userId === null) return null
  return identities.get(userId)?.nameClass ?? null
}

export function distinctUserIds(ids: readonly (number | null)[]): readonly number[] {
  return [...new Set(ids.filter((id): id is number => id !== null))]
}
