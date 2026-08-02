/** F63's pure admin-log view models. */
import type { AdminLogRow } from '@forum/admin'
import type { TimeModel } from '@forum/theme-kit'

import { formatTime } from './time'

export const ADMIN_LOG_PAGE_SIZE = 50

export interface AdminLogRowView {
  readonly id: number
  readonly action: string
  /** Who did it, or what happened to the account since. */
  readonly actor: string
  readonly ipPrefix: string | null
  /** The detail object, flattened to one line of plain text. */
  readonly detail: string
  readonly at: TimeModel
}

export interface AdminLogView {
  readonly rows: readonly AdminLogRowView[]
  readonly actions: readonly string[]
  readonly currentAction: string
  readonly nextHref: string | null
}

export function buildAdminLogView(input: {
  readonly rows: readonly AdminLogRow[]
  readonly actions: readonly string[]
  readonly currentAction: string
  readonly now: Date
  readonly timeZone?: string
}): AdminLogView {
  /* One extra row rather than a count, like every other pager here (F40). */
  const page = input.rows.slice(0, ADMIN_LOG_PAGE_SIZE)
  const last = page[page.length - 1]
  const hasMore = input.rows.length > ADMIN_LOG_PAGE_SIZE && last !== undefined

  const filter =
    input.currentAction === ''
      ? ''
      : `&action=${encodeURIComponent(input.currentAction)}`

  return {
    rows: page.map((row) => ({
      id: row.id,
      action: row.action,
      /*
       * A row whose actor has since been deleted still matters — that is
       * exactly the row somebody comes to the audit log to read — so it says
       * what happened rather than showing a blank.
       */
      actor: row.username ?? (row.userId === null ? 'the system' : 'a deleted account'),
      ipPrefix: row.ipPrefix,
      detail: flatten(row.detail),
      at: formatTime(row.createdAt, input.now, input.timeZone),
    })),
    actions: input.actions,
    currentAction: input.currentAction,
    nextHref: hasMore && last !== undefined ? `/admin/log?before=${last.id}${filter}` : null,
  }
}

/**
 * The detail object as one line of text.
 *
 * Not `JSON.stringify`: an audit row is read by a person under time pressure,
 * and `{"threadId":12,"toForumId":4}` is harder to scan than `threadId 12,
 * toForumId 4`. Nested values fall back to JSON rather than being walked —
 * every row this board writes is flat, and a deeper one from a plugin should
 * still render *something*.
 *
 * Bounded, because the column is `jsonb` and nothing stops a future writer
 * putting a kilobyte in it.
 */
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
