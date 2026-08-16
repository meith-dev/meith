import type { AdminLogRow } from '@meith/admin'
import type { TimeModel } from '@meith/theme-kit'

import { formatTime } from './time'

export const ADMIN_LOG_PAGE_SIZE = 50

export interface AdminLogRowView {
  readonly id: number
  readonly action: string
  readonly actor: string
  readonly ipPrefix: string | null
  readonly detail: string
  readonly at: TimeModel
}

export interface AdminLogView {
  readonly rows: readonly AdminLogRowView[]
  readonly actions: readonly string[]
  readonly currentAction: string
}

export function buildAdminLogView(input: {
  readonly rows: readonly AdminLogRow[]
  readonly actions: readonly string[]
  readonly currentAction: string
  readonly now: Date
  readonly timeZone?: string
}): AdminLogView {
  return {
    rows: input.rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.username ?? (row.userId === null ? 'the system' : 'a deleted account'),
      ipPrefix: row.ipPrefix,
      detail: flatten(row.detail),
      at: formatTime(row.createdAt, input.now, input.timeZone),
    })),
    actions: input.actions,
    currentAction: input.currentAction,
  }
}

function flatten(detail: Readonly<Record<string, unknown>>): string {
  const parts = Object.entries(detail).map(([key, value]) => {
    const rendered =
      value === null || value === undefined
        ? 'none'
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value)
    return `${key} ${rendered}`
  })

  const line = parts.join(', ')
  return line.length > 300 ? `${line.slice(0, 300)}…` : line
}
