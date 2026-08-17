import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { UserCpShell } from '@/components/account/usercp-shell'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { PATH_HEADER } from '@/server/location-header'
import { isSafeLocalPath } from '@/server/safe-path'

export default async function UserCpLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  const { memberSettings } = getContainer()

  if (memberSettings === null) notFound()

  // The proxy sends a visitor with no session cookie here, but a cookie that no
  // longer resolves — a session signed out from another device — passes it and
  // arrives as a guest. Answering that with a 404 tells the member the page is
  // gone when what happened is that they were signed out.
  if (actor.userId === null) {
    const path = (await headers()).get(PATH_HEADER)
    const next = path !== null && isSafeLocalPath(path) ? path : '/usercp'
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  return <UserCpShell>{children}</UserCpShell>
}
