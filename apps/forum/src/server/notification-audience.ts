import 'server-only'

import { getActor } from './context'

export type PreferenceAudience = 'member' | 'staff'

export async function audiencesForActor(): Promise<readonly PreferenceAudience[]> {
  const actor = await getActor()
  return actor.global.canAccessAdminCp === true ? ['member', 'staff'] : ['member']
}
