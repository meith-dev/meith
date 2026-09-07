import type { PluginRequest, PluginResponse, PluginRuntimeContext } from '@meith/plugin-kit'

import { asId, parseAward } from './awards'
import { archiveAward, awardById, deleteAward, grantAward, revokeGrant, saveAward } from './store'

export function toAdmin(page: string, notice: string): PluginResponse {
  return {
    kind: 'redirect',
    to: `/admin/plugins/awards/${page}?notice=${encodeURIComponent(notice)}`,
  }
}

export async function handleAward(
  request: PluginRequest,
  context: PluginRuntimeContext,
): Promise<PluginResponse> {
  const form = request.form ?? {}
  const id = asId(form.id)
  if (form.id && id === null) return toAdmin('awards', 'invalid')
  if (form.action === 'delete' || form.action === 'archive' || form.action === 'restore') {
    if (id === null || (await awardById(context.data, id)) === null)
      return toAdmin('awards', 'missing')
    if (form.action === 'delete')
      return toAdmin('awards', (await deleteAward(context.data, id)) ? 'deleted' : 'held')
    await archiveAward(context.data, id, form.action === 'archive')
    return toAdmin('awards', 'saved')
  }
  const parsed = parseAward(form)
  if (parsed.error !== undefined) return toAdmin('awards', parsed.error)
  return toAdmin('awards', await saveAward(context.data, parsed.draft, id))
}

export async function handleGrant(
  request: PluginRequest,
  context: PluginRuntimeContext,
): Promise<PluginResponse> {
  const form = request.form ?? {}
  if (form.action === 'revoke') {
    const id = asId(form.id)
    if (id === null) return toAdmin('grant', 'invalid')
    await revokeGrant(context.data, id)
    return toAdmin('grant', 'revoked')
  }
  const awardId = asId(form.award_id)
  const reason = (form.reason ?? '').trim()
  const names = [
    ...new Set(
      (form.usernames ?? '')
        .split(',')
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  if (awardId === null || !names.length || names.length > 200 || reason.length > 2000)
    return toAdmin('grant', 'invalid')
  const award = await awardById(context.data, awardId)
  if (award === null || award.archived_at !== null) return toAdmin('grant', 'missing')
  const members = await Promise.all(names.map((name) => context.users.byUsername(name)))
  if (members.some((member) => member === null)) return toAdmin('grant', 'unknown')
  let granted = 0
  for (const member of members) {
    if (
      member !== null &&
      (await grantAward(context, {
        awardId,
        userId: member.userId,
        byUserId: request.viewer.userId,
        reason,
      })) !== null
    )
      granted++
  }
  return toAdmin(
    'grant',
    granted === members.length ? 'granted' : granted === 0 ? 'already' : 'partial',
  )
}
