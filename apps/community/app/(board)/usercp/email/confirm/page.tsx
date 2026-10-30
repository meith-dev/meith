import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { AuthPage } from '@/components/auth/auth-page'
import { SubmitButton } from '@/components/auth/form-controls'
import { confirmEmailChangeAction } from '@/server/confirmation-actions'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { tr } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.confirm-e-mail-address') }
}

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const token = (await searchParams).token ?? ''
  const actor = await getActor()
  if (getContainer().memberSettings === null) notFound()
  if (actor.userId === null) {
    redirect(
      `/login?next=${encodeURIComponent(`/usercp/email/confirm?token=${encodeURIComponent(token)}`)}`,
    )
  }
  if (token === '') redirect('/usercp/security?failed=1')

  return (
    <AuthPage
      title={await tr('page.confirm-e-mail-address')}
      lede={await tr('page.confirm-token-prompt')}
    >
      <form action={confirmEmailChangeAction}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton>{await tr('page.confirm-e-mail-address')}</SubmitButton>
      </form>
    </AuthPage>
  )
}
