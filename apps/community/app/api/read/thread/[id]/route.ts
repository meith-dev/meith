import { PUBLIC_CONTENT } from '@meith/core'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { seeOther } from '@/server/see-other'

function idFrom(value: string | null): number | null {
  if (value === null || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url)
  const threadId = idFrom((await params).id)
  const postId = idFrom(url.searchParams.get('post'))
  const actor = await getActor()
  const { forums, posts, threads, authorizer, readState } = getContainer()
  if (threadId === null || postId === null || actor.userId === null || readState === null) return seeOther('/')

  const thread = await threads.findById(threadId, PUBLIC_CONTENT)
  if (!thread) return seeOther('/')
  const forum = await forums.findById(thread.forumId)
  if (!forum || forum.type !== 'forum') return seeOther('/')
  const matrix = await authorizer.forumMatrix(actor, forum.id)
  if (!authorizer.can(actor, 'thread.view', { forumId: forum.id, forum: matrix })) return seeOther('/')
  if ((await posts.findVisibleById(threadId, postId)) === null) return seeOther('/')

  await readState.markThreadRead(actor.userId, threadId, postId, new Date())
  return seeOther(`/thread/${threadId}-${thread.slug}`)
}
