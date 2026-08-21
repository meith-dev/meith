import type { MemberProfileRepository, MemberSuggestion } from '@meith/accounts'
import type { Actor, Authorizer } from '@meith/authorization'
import type { RelationService } from '@meith/relations'

const MIN_QUERY_LENGTH = 1
const MAX_QUERY_LENGTH = 32
const SUGGESTION_LIMIT = 8

export interface MentionSearchDeps {
  readonly authorizer: Authorizer
  readonly memberProfiles: MemberProfileRepository
  readonly relations: RelationService | null
}

export async function searchMentionCandidates(
  actor: Actor,
  rawQuery: string,
  deps: MentionSearchDeps,
): Promise<readonly MemberSuggestion[]> {
  const query = rawQuery.trim()
  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) return []
  if (!deps.authorizer.can(actor, 'profile.view')) return []

  const [matches, ignored] = await Promise.all([
    deps.memberProfiles.searchByUsernamePrefix(query, SUGGESTION_LIMIT * 2),
    actor.userId === null || deps.relations === null
      ? Promise.resolve<readonly number[]>([])
      : deps.relations.ignoredIds(actor.userId),
  ])

  if (ignored.length === 0) return matches.slice(0, SUGGESTION_LIMIT)

  const ignoredIds = new Set(ignored)
  return matches.filter((candidate) => !ignoredIds.has(candidate.id)).slice(0, SUGGESTION_LIMIT)
}
