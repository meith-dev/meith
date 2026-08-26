import { env, ForbiddenError } from '@meith/core'

import { DEMO_LOGIN_USERNAMES } from './accounts'

const PROTECTED = new Set(DEMO_LOGIN_USERNAMES.map((name) => name.toLowerCase()))

export function isProtectedDemoAccount(username: string): boolean {
  return env.DEMO_MODE && PROTECTED.has(username.trim().toLowerCase())
}

export type FrozenField = 'password' | 'email' | 'username' | 'sign-in method'

export function assertDemoAccountIsChangeable(username: string, what: FrozenField): void {
  if (!isProtectedDemoAccount(username)) return

  throw new ForbiddenError(
    `This is a demo, and "${username}" is one of its published logins — its ` +
      `${what} is fixed so that the next visitor can still get in. Register an ` +
      'account of your own and you can change anything you like on it.',
  )
}
