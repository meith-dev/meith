import { logoutAction } from '@/server/auth-actions'

export function LogoutForm() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="font-medium text-foreground hover:underline underline-offset-2"
      >
        Log out
      </button>
    </form>
  )
}
