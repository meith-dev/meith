import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { UserCpShell } from '@/components/account/usercp-shell'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { PATH_HEADER } from '@/server/location-header'
import { isSafeLocalPath } from '@/server/safe-path'

export default async function UserCpLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  const { memberSettings } = getContainer()

  if (memberSettings === null) notFound()

  if (actor.userId === null) {
    const path = (await headers()).get(PATH_HEADER)
    const next = path !== null && isSafeLocalPath(path) ? path : '/usercp'
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  return <UserCpShell>{children}</UserCpShell>
}
