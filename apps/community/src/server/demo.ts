import 'server-only'

import { env, logger } from '@meith/core'
import { getDb } from '@meith/db'
import {
  assertDemoAccountIsChangeable,
  type DemoBanner,
  demoBanner,
  type FrozenField,
  nextDemoResetAt,
} from '@meith/demo'

import { getContainer } from './container'

/**
 * Refuses a change to a published demo login's password or email.
 *
 * Checked by user id, resolved to a username here, because the demo package
 * cannot know the ids — they are handed out by Postgres at seed time and differ
 * every reset. The username is the stable thing.
 */
export async function assertDemoAccountChangeable(
  userId: number,
  what: FrozenField,
): Promise<void> {
  if (!env.DEMO_MODE) return

  const account = await getContainer().accountStore.accounts.findById(userId)
  if (account === null) return

  assertDemoAccountIsChangeable(account.username, what)
}

/**
 * The administrator's own edit screen can rename a member, and renaming
 * `admin` is the same lockout as changing its password by a longer route — the
 * banner would go on naming a login that no longer exists. Only refused when
 * the value actually differs, so an admin can still open the demo login's
 * account screen and change its groups.
 */
export async function assertDemoIdentityUnchanged(
  userId: number,
  submitted: { readonly username: string; readonly email: string },
): Promise<void> {
  if (!env.DEMO_MODE) return

  const account = await getContainer().accountStore.accounts.findById(userId)
  if (account === null) return

  if (submitted.username.trim().toLowerCase() !== account.usernameLower) {
    assertDemoAccountIsChangeable(account.username, 'username')
  }
  if (submitted.email.trim().toLowerCase() !== account.emailLower) {
    assertDemoAccountIsChangeable(account.username, 'email')
  }
}

/**
 * The banner's content, or `null` on any board that is not a demo.
 *
 * Failure here is deliberately quiet. The banner is an aid, and a board that
 * refuses to render because it could not work out when it next resets is worse
 * than a board that renders without the countdown.
 */
export async function demoBannerModel(): Promise<DemoBanner | null> {
  if (!env.DEMO_MODE) return null

  try {
    return demoBanner({
      nextResetAt: await nextDemoResetAt(getDb()),
      now: new Date(),
    })
  } catch (error) {
    logger({ module: 'demo' }).warn(
      { err: String(error) },
      'could not read the next demo reset time',
    )
    return demoBanner({ nextResetAt: null, now: new Date() })
  }
}
