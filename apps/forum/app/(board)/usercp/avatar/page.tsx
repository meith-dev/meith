import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { avatarUrl } from '@meith/avatars'
import { requireSlot } from '@meith/theme-kit'

import { AvatarForm } from '@/components/account/avatar-form'
import { avatarFor, canUploadAvatar } from '@/server/avatars'
import { getActor } from '@/server/context'
import { activeTheme } from '@/server/theme'
import { userCpNotice } from '@/view/usercp'

export const metadata: Metadata = { title: 'Your avatar' }

/**
 * F58 — the avatar screen.
 *
 * Absent entirely for a group without `avatar.upload`, and on a board with no
 * file store, rather than shown and then refused: a form whose only button
 * always fails is worse than no form (D32). The same rule the signature screen
 * follows.
 */
export default async function AvatarPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()

  if (actor.userId === null || !canUploadAvatar(actor)) notFound()

  const avatar = await avatarFor(actor.userId)
  const Notice = requireSlot(activeTheme, 'Notice')
  const notice = userCpNotice(query)

  return (
    <main id="board-content" tabIndex={-1} className="flex flex-1 flex-col gap-6">
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
