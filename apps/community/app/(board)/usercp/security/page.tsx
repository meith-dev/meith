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

/**
 * F57 — the two changes that need the current password.
 *
 * On one screen because they are one decision from the member's side ("change
 * how I sign in") and because both are guarded the same way. A session left
 * open on a shared machine is otherwise a full takeover: change the address,
 * request a reset, and the real owner is locked out of their own board.
 *
 * The e-mail change is two-step and the screen says so, because "we sent you a
 * link" is the only honest description of what pressing the button did.
 */
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
