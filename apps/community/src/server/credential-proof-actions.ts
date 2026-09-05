'use server'

import { redirect } from 'next/navigation'

import { verifyPassword } from '@meith/accounts'

import { limitMessage, refused, spendCredentialProofLimit } from './antispam'
import type { FormState } from './auth-form-state'
import { getContainer } from './container'
import { getActor } from './context'
import { markCurrentSessionCredentialProved } from './credential-proof'
import { text } from './form-values'
import { tr } from './i18n'
import { isSafeLocalPath } from './safe-path'
import { twoFactorService } from './two-factor'

export async function proveCredentialAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor()
  if (actor.userId === null) return { error: await tr('credentialProof.signIn') }

  const limited = await spendCredentialProofLimit(actor.userId)
  if (refused(limited)) return { error: limitMessage(limited) }

  const method = text(form, 'method')
  let proved = false

  if (method === 'password') {
    const account = await getContainer().accountStore.accounts.findById(actor.userId)
    proved = await verifyPassword(text(form, 'password'), account?.passwordHash)
  } else if (method === 'code') {
    const service = twoFactorService()
    const outcome =
      service === null
        ? null
        : await service.verify({ userId: actor.userId, code: text(form, 'code') })
    proved = outcome?.status === 'ok'
  }

  if (!proved) return { error: await tr('credentialProof.incorrect') }
  if (!(await markCurrentSessionCredentialProved(actor.userId))) {
    return { error: await tr('credentialProof.expired') }
  }

  const next = text(form, 'next')
  redirect(isSafeLocalPath(next) ? next : '/usercp/security?verified=1')
}
