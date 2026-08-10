import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import { PanelPage } from '@/components/shell/panel-page'
import { EmailForm, PasswordForm } from '@/components/account/usercp-forms'
import { boardAuthConfig } from '@/server/auth-config'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { currentTheme } from '@/server/theme'
import { userCpNotice } from '@/view/usercp'

export const metadata: Metadata = { title: 'Account security' }

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{
    changed?: string
    sent?: string
    confirmed?: string
    failed?: string
  }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) notFound()

  const settings = await memberSettings.read(actor.userId)
  if (settings === null) notFound()

  const notice = userCpNotice(query)
  const Notice = requireSlot(await currentTheme(), 'Notice')

  return (
    <PanelPage
      title="Account security"
      lede="Changing either your e-mail address or your password needs the password you have now."
    >
      {notice !== null && (
        <Notice
          kind={notice.kind}
          message={notice.message}
          dismissHref="/usercp/security"
        />
      )}

      <PasswordForm minLength={(await boardAuthConfig()).minPasswordLength} />
      <EmailForm email={settings.email} />
    </PanelPage>
  )
}
