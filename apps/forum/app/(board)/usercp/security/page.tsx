import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@forum/theme-kit'

import { EmailForm, PasswordForm } from '@/components/account/usercp-forms'
import { AUTH_CONFIG } from '@/server/auth-config'
import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { activeTheme } from '@/server/theme'
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
  searchParams: Promise<{ changed?: string; sent?: string; confirmed?: string; failed?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) notFound()

  const settings = await memberSettings.read(actor.userId)
  if (settings === null) notFound()

  const notice = userCpNotice(query)
  const Notice = requireSlot(activeTheme, 'Notice')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice kind={notice.kind} message={notice.message} dismissHref="/usercp/security" />
        )}

        <div>
          <h1 className="font-serif text-2xl font-semibold">Account security</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <a href="/usercp" className="text-primary hover:underline">
              Back to your control panel
            </a>
          </p>
        </div>

        <PasswordForm minLength={AUTH_CONFIG.minPasswordLength} />
        <EmailForm email={settings.email} />
      </div>
    </main>
  )
}
