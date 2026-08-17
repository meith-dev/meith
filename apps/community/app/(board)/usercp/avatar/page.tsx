import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { avatarUrl } from '@meith/avatars'
import { AVATAR_BOX, AVATAR_MAX_BYTES } from '@meith/avatars/limits'
import { requireSlot } from '@meith/theme-kit'

import { AvatarForm } from '@/components/account/avatar-form'
import { PanelPage } from '@/components/shell/panel-page'
import { avatarFor, canUploadAvatar } from '@/server/avatars'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { currentTheme } from '@/server/theme'
import { avatarFormCopy } from '@/view/account-copy'
import { userCpNotice } from '@/view/usercp'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.avatar') }
}

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
    <PanelPage title={await tr('page.avatar')} lede={await tr('page.shown-beside-every-post-make')}>
      {notice !== null && (
        <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/avatar" />
      )}

      <AvatarForm
        currentUrl={avatarUrl(actor.userId, avatar)}
        status={avatar.status}
        failureReason={avatar.failureReason}
        locked={avatar.locked}
        lockedReason={avatar.lockedReason}
        copy={avatarFormCopy(
          {
            maxMegabytes: Math.round(AVATAR_MAX_BYTES / (1024 * 1024)),
            width: AVATAR_BOX.width,
            height: AVATAR_BOX.height,
          },
          await getTranslator(),
        )}
      />
    </PanelPage>
  )
}
