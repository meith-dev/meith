import 'server-only'

/**
 * F55 — which notification kinds a viewer is offered.
 *
 * One rule, in one place, because the preferences *screen* and the action that
 * saves it must agree: a screen that renders a row the save path will not write
 * is a checkbox that silently does nothing, and a save path that writes rows the
 * screen never showed is a preference nobody set.
 *
 * The audience is derived from the permission the notification is aimed at —
 * `canAccessAdminCp`, the same field `system.task_failed` fans out to — rather
 * than from a group id, which is F20's rule everywhere else on the board.
 */
import { getActor } from './context'

export type PreferenceAudience = 'member' | 'staff'

/**
 * Everyone gets the member kinds; administrators additionally get the staff
 * ones. Ordered so the screen reads member-first, which is what almost every
 * viewer is there for.
 */
export async function audiencesForActor(): Promise<readonly PreferenceAudience[]> {
  const actor = await getActor()
  return actor.global.canAccessAdminCp === true ? ['member', 'staff'] : ['member']
}
