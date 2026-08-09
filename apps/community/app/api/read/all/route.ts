import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { seeOther } from '@/server/see-other'

export async function POST() {
  const actor = await getActor()
  const { authorizer, readState } = getContainer()
  if (actor.userId === null || readState === null) return seeOther('/')

  await readState.markForumsRead(actor.userId, await authorizer.visibleForumIds(actor), new Date())
  return seeOther('/')
}
