import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AuthPage } from '@/components/auth/auth-page'
import { PasskeySecondFactor } from '@/components/auth/passkey-second-factor'
import { SecondFactorForm } from '@/components/auth/second-factor-form'
import { configuredIdentity, getContainer } from '@/server/container'
import { tr } from '@/server/i18n'
import { isSafeLocalPath } from '@/server/safe-path'
import { readSecondFactorToken } from '@/server/session-cookies'
import { twoFactorState } from '@/server/two-factor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.confirm-it') }
}

export const dynamic = 'force-dynamic'

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const next = params.next !== undefined && isSafeLocalPath(params.next) ? params.next : '/'

  const token = await readSecondFactorToken()
  if (token === undefined || token === '') redirect('/login')

  const pending = await (await configuredIdentity()).pendingSecondFactor(token)
  if (pending === null) redirect('/login?sso=expired')

  const state = await twoFactorState(pending.userId)
  const passkeys = await getContainer().accountStore.passkeys.listForUser(pending.userId)

  return (
    <AuthPage
      title={await tr('page.one-more-step')}
      lede={await tr('page.password-was-right-enter-code')}
      links={[{ label: 'Back to sign in', href: '/login', lead: null }]}
    >
      <div className="flex flex-col gap-4">
        <SecondFactorForm next={params.next} recoveryCodesLeft={state.recoveryCodesLeft} />
        {passkeys.length > 0 ? <PasskeySecondFactor next={next} /> : null}
      </div>
    </AuthPage>
  )
}
