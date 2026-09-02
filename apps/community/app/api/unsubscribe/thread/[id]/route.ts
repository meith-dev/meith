import { ALL_THREAD_AUTHORS, PUBLIC_CONTENT } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { emitEvent } from '@/server/plugin-view'
import { crossOriginRefusal, isSameOrigin } from '@/server/same-origin'
import { seeOther } from '@/server/see-other'

function idFrom(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return crossOriginRefusal()

  const threadId = idFrom((await params).id)
  const actor = await getActor()
  const { threads, subscriptions } = getContainer()
  if (threadId === null || actor.userId === null || subscriptions === null) return seeOther('/')

  const thread = await threads.findById(threadId, PUBLIC_CONTENT, ALL_THREAD_AUTHORS)
  if (!thread) return seeOther('/')

  await subscriptions.unsubscribe({ userId: actor.userId, target: 'thread', targetId: threadId })

  await emitEvent(
    'subscription.changed',
    { userId: actor.userId, target: 'thread', targetId: threadId, subscribed: false },
    { requestId: currentRequestId() ?? null },
  )

  return seeOther(`/thread/${threadId}-${thread.slug}`)
}
