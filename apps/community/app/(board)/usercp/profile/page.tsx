import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { PanelPage } from '@/components/shell/panel-page'
import { DisplayGroupForm, ProfileForm } from '@/components/account/usercp-forms'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { profileFieldService, viewerFieldContext } from '@/server/profile-fields'
import { currentTheme } from '@/server/theme'
import {
  customFieldInputs,
  displayGroupChoices,
  profileFormValues,
  userCpNotice,
} from '@/view/usercp'

export const metadata: Metadata = { title: 'Your profile' }

export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) notFound()

  const settings = await memberSettings.read(actor.userId)
  if (settings === null) notFound()

  const values = profileFormValues(settings)
  const groups = displayGroupChoices(
    await memberSettings.groupsHeldBy(actor.userId),
    settings.displayGroupId,
  )

  const fields = profileFieldService()
  const context = await viewerFieldContext()
  const customFields =
    fields === null || context === null
      ? []
      : customFieldInputs(await fields.editableFor(actor.userId, context))
  const notice = userCpNotice(query)
  const Notice = requireSlot(await currentTheme(), 'Notice')

  return (
    <PanelPage
      title="Your profile"
      lede={
        <>
          Shown on{' '}
          <a
            href={`/member/${settings.userId}`}
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            your public profile
          </a>
          .
        </>
      }
    >
      {notice !== null && (
        <Notice
          kind={notice.kind}
          message={notice.message}
          dismissHref="/usercp/profile"
        />
      )}

      <ProfileForm {...values} customFields={customFields} />

      {groups.choices.length > 1 && <DisplayGroupForm {...groups} />}
    </PanelPage>
  )
}
