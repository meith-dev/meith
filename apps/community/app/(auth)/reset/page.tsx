import type { Metadata } from 'next'

import { AuthPage } from '@/components/auth/auth-page'
import { ResetRequestForm } from '@/components/auth/reset-request-form'

export const metadata: Metadata = { title: 'Reset password' }

export default function ResetPage() {
  return (
    <AuthPage
      title="Reset your password"
      lede="Enter your email and we’ll send a reset link."
      links={[{ label: 'Back to sign in', href: '/login', lead: null }]}
    >
      <ResetRequestForm />
    </AuthPage>
  )
}
