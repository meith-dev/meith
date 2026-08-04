import { logoutAction } from '@/server/auth-actions'

/**
 * The log-out control (F19), rendered into the theme's user panel.
 *
 * A Server Component wrapping a native form. Three consequences, all deliberate:
 *
 *  - it is a **POST**, so no prefetcher, link scanner or antivirus proxy can end
 *    someone's session by following a link;
 *  - it needs **no JavaScript** — this is a plain form submit, so it works on the
 *    no-JS list (R5) like the auth forms it belongs with;
 *  - it lives in the app, not the theme, because a theme must never hold a
 *    reference to a Server Action. It crosses into the slot as `children`.
 */
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
