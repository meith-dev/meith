import { NextResponse } from 'next/server'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'

export async function POST(request: Request) {
  const actor = await getActor()
  const { authorizer, readState } = getContainer()
  if (actor.userId === null || readState === null) return NextResponse.redirect(new URL('/', request.url), { status: 303 })

  await readState.markCommunitiesRead(actor.userId, await authorizer.visibleCommunityIds(actor), new Date())
  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}
