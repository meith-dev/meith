import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import type { ActivationOutcome } from '@meith/accounts'

import { configuredIdentity } from '@/server/container'

export const metadata: Metadata = { title: 'Confirm your account' }

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const token = (await searchParams).token ?? ''

  const outcome =
    token === '' ? 'invalid' : await (await configuredIdentity()).activateAccount(token)

  redirect(DESTINATION[outcome])
}

const DESTINATION: Record<ActivationOutcome, string> = {
  activated: '/login?activated=1',
  'awaiting-approval': '/login?confirmed=1',
  'already-active': '/login?already=1',
  banned: '/login?verify=failed',
  invalid: '/login?verify=failed',
}
