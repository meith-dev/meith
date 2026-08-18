import type { Metadata } from 'next'

import { AuthPage } from '@/components/auth/auth-page'
import { ResendVerificationForm } from '@/components/auth/resend-verification-form'
import { getTranslator, tr } from '@/server/i18n'
import { resendVerificationFormCopy } from '@/view/auth-copy'
import { splitAround } from '@/view/copy'

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
  const t = await getTranslator()
  const [sentLead, sentTail] = splitAround(t, 'page.verify.sentTo', 'email')

  const lede =
    params.sent === '1' ? (
      email === '' ? (
        <>{t.t('page.we-have-sent-confirmation-link')}</>
      ) : (
        <>
          {sentLead}
          <strong className="font-medium text-foreground">{email}</strong>
          {sentTail}
        </>
      )
    ) : (
      <>{t.t('page.enter-address-registered-with-we')}</>
    )

  return (
    <AuthPage
      title={await tr('page.confirm-account')}
      lede={lede}
      note={t.t('page.verify.note')}
      links={[{ label: t.t('authLink.backToSignIn'), href: '/login', lead: null }]}
    >
      <ResendVerificationForm
        email={email === '' ? undefined : email}
        copy={resendVerificationFormCopy(t)}
      />
    </AuthPage>
  )
}
