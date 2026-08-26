import type { PluginRequest, PluginResponse, PluginRuntimeContext } from '@meith/plugin-kit'

import { mayAdd, resolveCalendarConfig } from './access'
import { readDraft } from './events'
import { ICS_CONTENT_TYPE, toIcs } from './ics'
import { addOrganiser, createEvent, eventById, organiserIds, removeOrganiser } from './store'

export const CALENDAR_PATH = '/plugins/calendar'

function seeCalendar(): PluginResponse {
  return { kind: 'redirect', to: CALENDAR_PATH }
}

function refused(status: number, message: string): PluginResponse {
  return { kind: 'json', status, body: { error: message } }
}

export async function handleCreateEvent(
  request: PluginRequest,
  context: PluginRuntimeContext,
): Promise<PluginResponse> {
  const form = request.form
  if (form === null) return refused(400, 'form-required')

  const config = resolveCalendarConfig(context.settings)
  const verdict = mayAdd({
    userId: request.viewer.userId,
    config,
    organisers: await organiserIds(context.data),
  })

  if (verdict !== 'allowed') return refused(403, verdict)

  const { draft, problems } = readDraft(form)
  if (draft === null) return refused(400, problems.join(','))

  await createEvent(context.data, draft, request.viewer.userId)
  return seeCalendar()
}

export async function handleEventIcs(
  request: PluginRequest,
  context: PluginRuntimeContext,
): Promise<PluginResponse> {
  const id = request.query.id?.trim() ?? ''
  if (!/^\d+$/.test(id)) return refused(400, 'id-required')

  const event = await eventById(context.data, id)
  if (event === null) return refused(404, 'no-such-event')

  return {
    kind: 'text',
    body: toIcs(event, request.boardUrl, new Date()),
    contentType: ICS_CONTENT_TYPE,
  }
}

export async function handleAddOrganiser(
  request: PluginRequest,
  context: PluginRuntimeContext,
): Promise<PluginResponse> {
  const username = request.form?.username?.trim() ?? ''
  if (username === '') return refused(400, 'username-required')

  const member = await context.users.byUsername(username)
  if (member === null) return refused(404, 'unknown-member')

  await addOrganiser(context.data, member.userId, request.viewer.userId)
  return { kind: 'redirect', to: '/admin/plugins/calendar/organisers' }
}

export async function handleRemoveOrganiser(
  request: PluginRequest,
  context: PluginRuntimeContext,
): Promise<PluginResponse> {
  const raw = request.form?.user_id?.trim() ?? ''
  const userId = Number(raw)
  if (!Number.isSafeInteger(userId) || userId <= 0) return refused(400, 'user-id-required')

  await removeOrganiser(context.data, userId)
  return { kind: 'redirect', to: '/admin/plugins/calendar/organisers' }
}
