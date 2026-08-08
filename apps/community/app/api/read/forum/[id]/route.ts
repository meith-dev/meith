import { NextResponse } from 'next/server'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'

function idFrom(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idFrom((await params).id)
  const actor = await getActor()
  const { forums, authorizer, readState } = getContainer()
  if (id === null || actor.userId === null || readState === null) return NextResponse.redirect(new URL('/', request.url), { status: 303 })

  const forum = await forums.findById(id)
  if (!forum || forum.type !== 'forum') return NextResponse.redirect(new URL('/', request.url), { status: 303 })
  const matrix = await authorizer.forumMatrix(actor, id)
  if (!authorizer.can(actor, 'forum.view', { forumId: id, forum: matrix })) return NextResponse.redirect(new URL('/', request.url), { status: 303 })

  await readState.markForumsRead(actor.userId, [id], new Date())
  return NextResponse.redirect(new URL(`/${id}-${forum.slug}`, request.url), { status: 303 })
}
