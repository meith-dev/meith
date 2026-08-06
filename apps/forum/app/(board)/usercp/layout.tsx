import { notFound } from 'next/navigation'

import { UserCpShell } from '@/components/account/usercp-shell'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'

export default async function UserCpLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  const { memberSettings } = getContainer()

  if (actor.userId === null || memberSettings === null) notFound()

  return <UserCpShell>{children}</UserCpShell>
}
