import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { avatarUrl } from '@meith/avatars'
import { requireSlot } from '@meith/theme-kit'

import { AvatarForm } from '@/components/account/avatar-form'
import { PanelPage } from '@/components/shell/panel-page'
import { avatarFor, canUploadAvatar } from '@/server/avatars'
import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
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
  const notice = userCpNotice(query, await getTranslator())

  return (
    <PanelPage title="Your avatar" lede="Shown beside every post you make, and on your profile.">
      {notice !== null && (
        <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/avatar" />
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
