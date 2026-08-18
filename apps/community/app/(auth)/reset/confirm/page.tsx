import type { Metadata } from 'next'

import { AuthPage } from '@/components/auth/auth-page'
import { ResetConfirmForm } from '@/components/auth/reset-confirm-form'
import { boardAuthConfig } from '@/server/auth-config'
import { getTranslator, tr } from '@/server/i18n'
import { resetConfirmFormCopy } from '@/view/auth-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.choose-new-password') }
}

export default async function ResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <AuthPage
        title={await tr('page.invalid-reset-link')}
        lede={await tr('page.this-link-missing-its-token')}
        links={[{ label: await tr('authLink.requestNewLink'), href: '/reset', lead: null }]}
      />
    )
  }

  return (
    <AuthPage
      title={await tr('page.choose-new-password')}
      lede={await tr('page.enter-new-password-for-account')}
    >
      <ResetConfirmForm
        token={token}
        minLength={(await boardAuthConfig()).minPasswordLength}
        copy={resetConfirmFormCopy(
          (await boardAuthConfig()).minPasswordLength,
          await getTranslator(),
        )}
      />
    </AuthPage>
  )
}
