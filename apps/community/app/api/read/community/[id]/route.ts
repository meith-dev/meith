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
  const { communities, authorizer, readState } = getContainer()
  if (id === null || actor.userId === null || readState === null) return NextResponse.redirect(new URL('/', request.url), { status: 303 })

  const community = await communities.findById(id)
  if (!community || community.type !== 'community') return NextResponse.redirect(new URL('/', request.url), { status: 303 })
  const matrix = await authorizer.communityMatrix(actor, id)
  if (!authorizer.can(actor, 'community.view', { communityId: id, community: matrix })) return NextResponse.redirect(new URL('/', request.url), { status: 303 })

  await readState.markCommunitiesRead(actor.userId, [id], new Date())
  return NextResponse.redirect(new URL(`/community/${id}-${community.slug}`, request.url), { status: 303 })
}
