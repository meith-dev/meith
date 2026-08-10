import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { seeOther } from '@/server/see-other'
import { canHoldThreads } from '@meith/forums'

function idFrom(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idFrom((await params).id)
  const actor = await getActor()
  const { forums, authorizer, readState } = getContainer()
  if (id === null || actor.userId === null || readState === null) return seeOther('/')

  const forum = await forums.findById(id)
  if (!forum || !canHoldThreads(forum.type)) return seeOther('/')
  const matrix = await authorizer.forumMatrix(actor, id)
  if (!authorizer.can(actor, 'forum.view', { forumId: id, forum: matrix })) return seeOther('/')

  await readState.markForumsRead(actor.userId, [id], new Date())
  return seeOther(`/${id}-${forum.slug}`)
}
