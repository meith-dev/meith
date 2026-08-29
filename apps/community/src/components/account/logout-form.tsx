import { logoutAction } from '@/server/auth-actions'

import { PendingButton } from '../auth/form-controls'

export function LogoutForm({ label }: { label: string }) {
  return (
    <form action={logoutAction}>
      <PendingButton
        showWorking
        className="font-medium text-foreground hover:underline underline-offset-2"
      >
        {label}
      </PendingButton>
    </form>
  )
}
