'use server'

import { revalidatePath } from 'next/cache'

import { ForbiddenError, isAppError, logger, publicMessageOf } from '@meith/core'
import { msg } from '@meith/i18n'

import type { FormState } from './auth-form-state'
import { getActor } from './context'
import { issueFeedToken, revokeFeedToken } from './feed-token'
import { getMessageResolver, tr } from './i18n'
import { origin } from './syndication'

async function currentMemberId(): Promise<number> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))
  return actor.userId
}

async function toState(err: unknown): Promise<FormState> {
  if (isAppError(err)) return { error: publicMessageOf(err, await getMessageResolver()) }
  logger({ module: 'feed-token-actions' }).error({ err }, 'feed token action failed')
  return { error: await tr('notice.app.something-went-wrong-please-try') }
}

export async function regenerateFeedTokenAction(
  _prev: FormState,
  _form: FormData,
): Promise<FormState> {
  try {
    const userId = await currentMemberId()
    const token = await issueFeedToken(userId)
    const base = await origin()

    revalidatePath('/usercp/security')

    return {
      notice: 'feed:issued',
      values: {
        token,
        rssUrl: `${base}/feed.xml?token=${token}`,
        atomUrl: `${base}/atom.xml?token=${token}`,
      },
    }
  } catch (err) {
    return toState(err)
  }
}

export async function revokeFeedTokenAction(_prev: FormState, _form: FormData): Promise<FormState> {
  try {
    const userId = await currentMemberId()
    await revokeFeedToken(userId)

    revalidatePath('/usercp/security')

    return { notice: 'feed:revoked' }
  } catch (err) {
    return toState(err)
  }
}
