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

export async function assertDemoAccountChangeable(
  userId: number,
  what: FrozenField,
): Promise<void> {
  if (!env.DEMO_MODE) return

  const account = await getContainer().accountStore.accounts.findById(userId)
  if (account === null) return

  assertDemoAccountIsChangeable(account.username, what)
}

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
