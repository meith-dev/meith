import { ForbiddenError, env } from '@meith/core'

import { DEMO_LOGIN_USERNAMES } from './accounts'

const PROTECTED = new Set(DEMO_LOGIN_USERNAMES.map((name) => name.toLowerCase()))

/**
 * The published accounts are shared, so a change one visitor makes to one is a
 * change every later visitor inherits. Changing `admin`'s password does not
 * customise a demo, it takes the demo away from everybody until the next reset;
 * changing its email does the same to the password-reset route out of that.
 *
 * Everything else about these accounts is fair game — post as them, rename them,
 * move them between groups, ban them. Those are all things the next reset undoes
 * and none of them lock the door behind you.
 */
export function isProtectedDemoAccount(username: string): boolean {
  return env.DEMO_MODE && PROTECTED.has(username.trim().toLowerCase())
}

export type FrozenField = 'password' | 'email' | 'username'

export function assertDemoAccountIsChangeable(username: string, what: FrozenField): void {
  if (!isProtectedDemoAccount(username)) return

  throw new ForbiddenError(
    `This is a demo, and "${username}" is one of its published logins — its ` +
      `${what} is fixed so that the next visitor can still get in. Register an ` +
      'account of your own and you can change anything you like on it.',
  )
}
