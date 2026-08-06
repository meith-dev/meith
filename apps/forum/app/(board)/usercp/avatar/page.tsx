import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { avatarUrl } from '@meith/avatars'
import { requireSlot } from '@meith/theme-kit'

import { AvatarForm } from '@/components/account/avatar-form'
import { avatarFor, canUploadAvatar } from '@/server/avatars'
import { getActor } from '@/server/context'
import { currentTheme } from '@/server/theme'
import { userCpNotice } from '@/view/usercp'

export const metadata: Metadata = { title: 'Your avatar' }

export default async function AvatarPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()

  if (actor.userId === null || !canUploadAvatar(actor)) notFound()

  const avatar = await avatarFor(actor.userId)
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = userCpNotice(query)

  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8"
    >
      {notice !== null && (
        <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/avatar" />
      )}

      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Your avatar</h1>
        <p className="text-sm text-muted-foreground">
          Shown beside every post you make, and on your profile.
        </p>
      </div>

      <AvatarForm
        currentUrl={avatarUrl(actor.userId, avatar)}
        status={avatar.status}
        failureReason={avatar.failureReason}
        locked={avatar.locked}
        lockedReason={avatar.lockedReason}
      />
    </main>
  )
}
