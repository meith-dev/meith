import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { avatarUrl } from '@meith/avatars'
import { requireSlot } from '@meith/theme-kit'

import { PanelPage } from '@/components/shell/panel-page'
import { AvatarForm } from '@/components/account/avatar-form'
import { avatarFor, canUploadAvatar } from '@/server/avatars'
import { getActor } from '@/server/context'
import { currentTheme } from '@/server/theme'
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
  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = userCpNotice(query)

  /*
   * A measure, like every other screen under `/usercp`. This `<main>` had none
   * at all, so its heading and its form ran the full width of the viewport
   * while the panel's index and its siblings were centred — one link away from
   * each other and half a screen apart.
   */
  return (
    <PanelPage
      title="Your avatar"
      lede="Shown beside every post you make, and on your profile."
    >
      {notice !== null && (
        <Notice
          kind={notice.kind}
          message={notice.message}
          dismissHref="/usercp/avatar"
        />
      )}

      <AvatarForm
        currentUrl={avatarUrl(actor.userId, avatar)}
        status={avatar.status}
        failureReason={avatar.failureReason}
        locked={avatar.locked}
        lockedReason={avatar.lockedReason}
      />
    </PanelPage>
  )
}
