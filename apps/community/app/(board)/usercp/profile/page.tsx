import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot, slotCopy } from '@meith/theme-kit'

import { DisplayGroupForm, ProfileForm } from '@/components/account/usercp-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { profileFieldService, viewerFieldContext } from '@/server/profile-fields'
import { currentTheme } from '@/server/theme'
import { displayGroupFormCopy, profileFormCopy } from '@/view/account-copy'
import {
  customFieldInputs,
  displayGroupChoices,
  profileFormValues,
  userCpNotice,
} from '@/view/usercp'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.profile') }
}

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
  const notice = userCpNotice(query, await getTranslator())
  const Notice = requireSlot(await currentTheme(), 'Notice')

  return (
    <PanelPage
      title={await tr('page.profile')}
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
          copy={slotCopy(await currentTheme(), 'Notice', await getTranslator())}
        />
      )}

      <ProfileForm
        {...values}
        customFields={customFields}
        copy={profileFormCopy(await getTranslator())}
      />

      {groups.choices.length > 1 && (
        <DisplayGroupForm {...groups} copy={displayGroupFormCopy(await getTranslator())} />
      )}
    </PanelPage>
  )
}
