'use server'

import type { MemberSuggestion } from '@meith/accounts'

import { getContainer } from './container'
import { getActor } from './context'
import { searchMentionCandidates } from './mention-search'
import { relationService } from './relations'

export async function searchMentionCandidatesAction(
  query: string,
): Promise<readonly MemberSuggestion[]> {
  const actor = await getActor()
  const { authorizer, memberProfiles } = getContainer()

  return searchMentionCandidates(actor, typeof query === 'string' ? query : '', {
    authorizer,
    memberProfiles,
    relations: relationService(),
  })
}
