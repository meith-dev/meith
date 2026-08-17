import type { Metadata } from 'next'

import { AuthPage } from '@/components/auth/auth-page'
import { ResendVerificationForm } from '@/components/auth/resend-verification-form'
import { tr } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.confirm-account') }
}

export default async function ResendVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; sent?: string }>
}) {
  const params = await searchParams
  const email = params.email ?? ''

  const lede =
    params.sent === '1' ? (
      email === '' ? (
        <>{await tr('page.we-have-sent-confirmation-link')}</>
      ) : (
        <>
          We have sent a confirmation link to{' '}
          <strong className="font-medium text-foreground">{email}</strong>. Follow it to finish
          setting up your account — until then you will not be able to sign in.
        </>
      )
    ) : (
      <>{await tr('page.enter-address-registered-with-we')}</>
    )

  return (
    <AuthPage
      title={await tr('page.confirm-account')}
      lede={lede}
      note="Nothing arrived? Check the spam folder first, then send another link. Each new link replaces the last one."
      links={[{ label: 'Back to sign in', href: '/login', lead: null }]}
    >
      <ResendVerificationForm email={email === '' ? undefined : email} />
    </AuthPage>
  )
}
