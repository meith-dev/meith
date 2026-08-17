import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { foldIdentifier } from '@meith/accounts'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { memberHref } from '@/view/member-profile'

export const metadata: Metadata = { title: 'Member profile' }

export default async function MemberByNamePage({ params }: { params: Promise<{ name: string }> }) {
  const raw = (await params).name
  let name: string
  try {
    name = decodeURIComponent(raw)
  } catch {
    notFound()
  }

  const actor = await getActor()
  const { authorizer, accountStore } = getContainer()
  if (!authorizer.can(actor, 'profile.view')) notFound()

  const account = await accountStore.accounts.findByUsernameLower(foldIdentifier(name))
  if (account === null) notFound()

  redirect(memberHref(account.id))
}
