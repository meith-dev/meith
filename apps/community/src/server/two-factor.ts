import 'server-only'

import { headers } from 'next/headers'

import {
  TwoFactorService,
  type Enrolment,
  type TwoFactorState,
} from '@meith/accounts'
import { env, truncateIp } from '@meith/core'

import { remoteAddress } from './admin'
import { getActor } from './context'
import { getContainer } from './container'
import { getSettingsUncached } from './settings'

export interface SecondFactorPosture {
  readonly offered: boolean
  readonly required: boolean
}

export function twoFactorService(): TwoFactorService | null {
  const key = env.AUTH_SECRET
  if (key === undefined || key.trim() === '') return null

  const { accountStore } = getContainer()

  return new TwoFactorService({
    accounts: accountStore.accounts,
    twoFactor: accountStore.twoFactor,
    recoveryCodes: accountStore.recoveryCodes,
    sealingKey: key,
  })
}

/**
 * Offered when the board says so and the board has a key to seal a secret
 * with. Without AUTH_SECRET there is nowhere safe to put the secret, so the
 * surface is hidden rather than half-built.
 */
export async function twoFactorOffered(): Promise<boolean> {
  if (getContainer().dataSource !== 'postgres') return false
  if (twoFactorService() === null) return false

  return (await getSettingsUncached()).get('security.two_factor_enabled')
}

export async function twoFactorRequiredForStaff(): Promise<boolean> {
  if (!(await twoFactorOffered())) return false
  return (await getSettingsUncached()).get('security.two_factor_required_for_staff')
}

/** Whether this member must hold a second factor, and may not drop it. */
export async function secondFactorPosture(
  userId: number | null,
): Promise<SecondFactorPosture> {
  const offered = await twoFactorOffered()
  if (!offered || userId === null) return { offered, required: false }

  if (!(await twoFactorRequiredForStaff())) return { offered, required: false }

  const actor = await getActor()
  if (actor.userId !== userId) return { offered, required: false }

  return { offered, required: getContainer().authorizer.can(actor, 'admincp.access') }
}

export async function pendingEnrolment(userId: number): Promise<Enrolment | null> {
  const service = twoFactorService()
  if (service === null) return null

  const name = (await getSettingsUncached()).get('board.name')
  return service.pendingEnrolment(userId, name.trim() === '' ? 'Meith' : name)
}

export async function twoFactorState(userId: number): Promise<TwoFactorState> {
  const service = twoFactorService()
  if (service === null) return { enrolled: false, pending: false, recoveryCodesLeft: 0 }

  return service.state(userId)
}

export async function requestFingerprint(): Promise<{
  readonly ipPrefix: string | null
  readonly userAgent: string | null
}> {
  const incoming = await headers()
  const agent = incoming.get('user-agent')

  return {
    ipPrefix: truncateIp(await remoteAddress()) ?? null,
    userAgent: agent === null || agent.trim() === '' ? null : agent.slice(0, 300),
  }
}
