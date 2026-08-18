import type { Metadata } from 'next'

import { AuthPage } from '@/components/auth/auth-page'
import { ResetRequestForm } from '@/components/auth/reset-request-form'
import { getTranslator, tr } from '@/server/i18n'
import { resetRequestFormCopy } from '@/view/auth-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.reset-password') }
}

export default async function ResetPage() {
  return (
    <AuthPage
      title={await tr('page.reset-password-2')}
      lede={await tr('page.enter-email-we-ll-send')}
      links={[{ label: await tr('authLink.backToSignIn'), href: '/login', lead: null }]}
    >
      <ResetRequestForm copy={resetRequestFormCopy(await getTranslator())} />
    </AuthPage>
  )
}
