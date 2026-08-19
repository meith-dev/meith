import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import type { ActivationOutcome } from '@meith/accounts'
import { currentRequestId } from '@meith/core/logger'

import { configuredIdentity } from '@/server/container'
import { tr } from '@/server/i18n'
import { emitEvent } from '@/server/plugin-view'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.confirm-account') }
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const token = (await searchParams).token ?? ''

  const result =
    token === ''
      ? { outcome: 'invalid' as const, userId: null }
      : await (await configuredIdentity()).activateAccount(token)

  if (result.outcome === 'activated' && result.userId !== null) {
    await emitEvent(
      'user.activated',
      { userId: result.userId },
      { requestId: currentRequestId() ?? null },
    )
  }

  redirect(DESTINATION[result.outcome])
}

const DESTINATION: Record<ActivationOutcome, string> = {
  activated: '/login?activated=1',
  'awaiting-approval': '/login?confirmed=1',
  'already-active': '/login?already=1',
  banned: '/login?verify=failed',
  invalid: '/login?verify=failed',
}
