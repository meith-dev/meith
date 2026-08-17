import { notFound, redirect } from 'next/navigation'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { JUMP_FIELD, parseJumpTarget } from '@/view/forum-jump'

export default async function JumpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<never> {
  const forumId = parseJumpTarget((await searchParams)[JUMP_FIELD])

  if (forumId === null) redirect('/')

  const { authorizer, forums } = getContainer()
  const actor = await getActor()

  const visible = new Set(await authorizer.forumIdsWhere(actor, 'forum.view'))
  if (!visible.has(forumId)) notFound()

  const forum = await forums.findById(forumId)
  if (forum === null) notFound()

  if (forum.type === 'category') redirect('/')

  redirect(`/${forum.id}-${forum.slug}`)
}
