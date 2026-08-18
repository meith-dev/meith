import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import type { ActivationOutcome } from '@meith/accounts'

import { configuredIdentity } from '@/server/container'
import { tr } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.confirm-account') }
}

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
