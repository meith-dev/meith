import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@forum/theme-kit'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { activeTheme } from '@/server/theme'
import { buildMemberProfileView } from '@/view/member-profile'

export const metadata: Metadata = { title: 'Member profile' }

function memberId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const id = memberId((await params).id)
  if (id === null) notFound()

  const actor = await getActor()
  const { authorizer, memberProfiles } = getContainer()
  if (!authorizer.can(actor, 'profile.view')) notFound()

  const profile = await memberProfiles.findPublicById(id)
  if (!profile) notFound()

  const MemberProfile = requireSlot(activeTheme, 'MemberProfile')
  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <MemberProfile {...buildMemberProfileView(profile, new Date())} />
    </main>
  )
}
