import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AuthPage } from '@/components/auth/auth-page'
import { SubmitButton } from '@/components/auth/form-controls'
import { confirmAccountAction } from '@/server/confirmation-actions'
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
  if (token === '') redirect('/login?verify=failed')

  return (
    <AuthPage title={await tr('page.confirm-account')} lede={await tr('page.confirm-token-prompt')}>
      <form action={confirmAccountAction}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton>{await tr('page.confirm-account')}</SubmitButton>
      </form>
    </AuthPage>
  )
}
