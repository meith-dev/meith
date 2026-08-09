'use server'

/**
 * F81 — issuing and revoking API tokens from the ACP.
 *
 * Both actions re-authorise. Rendering the screen proved the operator was an
 * administrator *then*; these are public endpoints and nothing stops a direct
 * POST, which is the same reason every other action on this board calls
 * `requireAdmin()` rather than trusting the page that drew the form.
 *
 * **The secret comes back in the form state and is never stored anywhere else.**
 * It is shown once and the operator copies it. There is no "show again", not as
 * an omission but because the board holds only a hash — the alternative would be
 * keeping a reversible copy of every token, which is the thing hashing exists to
 * avoid.
 */
import { isAppError, logger } from '@meith/core'
import { revalidatePath } from 'next/cache'

import { requireAdmin } from './admin'
import { apiTokenStore, issueApiToken } from './api-tokens-admin'
import { recordAdminAction } from './admin'
import type { FormState } from './auth-form-state'

function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Refresh the token table this action was posted from.
 *
 * Without it the screen keeps the RSC payload it was rendered with, so with
 * JavaScript on — which is how an administrator uses the panel — issuing a
 * token showed the secret above a table that did not contain it, and revoking
 * one left the row reading **live**. The write had happened both times.
 *
 * Revocation is the one operation here performed under time pressure, which is
 * what makes the stale row worse than untidy: an operator containing a leaked
 * token is looking at this table for confirmation, and it was telling them the
 * token was still good.
 *
 * Same fix and same reasoning as `invalidateTree` in `forum-admin-actions.ts`,
 * which the 7 August 2026 audit added for exactly this on `/admin/forums`. This
 * screen was missed then; `e2e/api-v1.spec.ts` is what found it.
 */
function refreshTokenList(): void {
  revalidatePath('/admin/api-tokens')
}

function toState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'api-token-actions' }).error({ err }, 'api token action failed')
  return { error: 'Something went wrong. Please try again.' }
}

export async function issueApiTokenAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const admin = await requireAdmin()

    const days = Number(field(form, 'expiresInDays'))
    /*
     * An absent or unparseable expiry means *no* expiry, which is the honest
     * reading of an empty field on this form. A token that silently expired
     * because a blank box became `new Date(NaN)` would fail an integration at
     * an unpredictable moment with nothing in the log to explain it.
     */
    const expiresAt =
      Number.isSafeInteger(days) && days > 0
        ? new Date(Date.now() + days * 86_400_000)
        : null

    const token = await issueApiToken({
      /*
       * Owned by the administrator who issued it. A token is a *restriction* on
       * an actor rather than a grant, so the owner decides its ceiling — and
       * issuing one against somebody else's account would let an operator act
       * as a member without an authentication event.
       */
      userId: admin.userId,
      name: field(form, 'name'),
      scopes: form.getAll('scopes').filter((s): s is string => typeof s === 'string'),
      expiresAt,
    })

    await recordAdminAction({
      action: 'system.api_token_issued',
      detail: { name: field(form, 'name') },
    })

    refreshTokenList()

    /* The one and only copy. `values` carries it back to the screen; nothing
       writes it to a log, and the audit row above records the name only. */
    return { notice: 'issued', values: { token } }
  } catch (err) {
    return toState(err)
  }
}

export async function revokeApiTokenAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireAdmin()

    const id = Number(field(form, 'tokenId'))
    if (!Number.isSafeInteger(id) || id <= 0) return { error: 'No such token.' }

    const store = apiTokenStore()
    if (store === null) return { error: 'This board has no database, so it has no API.' }

    /* Idempotent: revoking an already-revoked token is not an error, because
       an operator clicking twice during an incident should not see a failure. */
    const revoked = await store.revoke(id, new Date())
    if (revoked) {
      await recordAdminAction({ action: 'system.api_token_revoked', detail: { tokenId: id } })
    }

    refreshTokenList()
    return { notice: 'revoked' }
  } catch (err) {
    return toState(err)
  }
}
