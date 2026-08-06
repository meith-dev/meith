import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { MemberSettingsService } from '@meith/accounts'

import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'

export const metadata: Metadata = { title: 'Confirm your e-mail address' }

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const token = (await searchParams).token ?? ''
  const actor = await getActor()
  const { memberSettings, accountStore } = getContainer()

  if (memberSettings === null) notFound()
  if (actor.userId === null) {
    redirect(`/login?next=${encodeURIComponent(`/usercp/email/confirm?token=${token}`)}`)
  }

  const outcome =
    token === ''
      ? null
      : await new MemberSettingsService({
          settings: memberSettings,
          accounts: accountStore.accounts,
          sessions: accountStore.sessions,
          tokens: accountStore.tokens,
        }).confirmEmailChange(token)

  redirect(outcome === null ? '/usercp/security?failed=1' : '/usercp/security?confirmed=1')
}
