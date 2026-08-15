import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { crossOriginRefusal, isSameOrigin } from '@/server/same-origin'
import { seeOther } from '@/server/see-other'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return crossOriginRefusal()

  const actor = await getActor()
  const { authorizer, readState } = getContainer()
  if (actor.userId === null || readState === null) return seeOther('/')

  await readState.markForumsRead(actor.userId, await authorizer.visibleForumIds(actor), new Date())
  return seeOther('/')
}
