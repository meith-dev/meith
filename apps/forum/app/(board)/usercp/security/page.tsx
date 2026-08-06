import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

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
  searchParams: Promise<{ changed?: string; sent?: string; confirmed?: string; failed?: string }>
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
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/security" />
        )}

        <div>
          <h1 className="font-serif text-2xl font-semibold">Account security</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <a href="/usercp" className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Back to your control panel
            </a>
          </p>
        </div>

        <PasswordForm minLength={(await boardAuthConfig()).minPasswordLength} />
        <EmailForm email={settings.email} />
      </div>
    </main>
  )
}
